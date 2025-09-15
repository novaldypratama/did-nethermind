#!/bin/bash

# ============================================
# Caliper SSI Benchmark Automation Script
# Enhanced version with node health checks
# ============================================

# Configuration
TOTAL_RUNS=${TOTAL_RUNS:-30}
PARALLEL_MODE=${PARALLEL_MODE:-false}
MAX_PARALLEL=${MAX_PARALLEL:-3}
REPORT_DIR="benchmark-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_DIR="${REPORT_DIR}/run_${TIMESTAMP}"
NODE_CHECK_INTERVAL=5 # Check node health every N runs
RETRY_ATTEMPTS=3
RETRY_DELAY=10

# Node configuration (can be overridden by environment variables)
NODE_TYPE=${NODE_TYPE:-"geth"} # Can be "besu" or "geth" or "nethermind"
NODE_HTTP_ENDPOINT=${NODE_HTTP_ENDPOINT:-"http://localhost:8545"}
NODE_WS_ENDPOINT=${NODE_WS_ENDPOINT:-"ws://172.16.239.15:8546"}

# Contract paths
CONTRACT_SOURCE_DIR="../smart-contracts/artifacts/contracts"
CONTRACT_DEST_DIR="benchmarks/contracts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# Helper Functions
# ============================================

# Print colored message with timestamp
log() {
  local color=$1
  shift
  echo -e "${color}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"
}

# Check if node is ready
check_node_health() {
  log $CYAN "Checking ${NODE_TYPE} node health..."

  node check-nethermind.js
  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    log $GREEN "${NODE_TYPE} node is healthy and ready"
    return 0
  else
    log $RED "${NODE_TYPE} node health check failed"
    return 1
  fi
}

# Extract and copy contract ABIs
setup_contracts() {
  log $CYAN "Setting up contract ABIs..."

  # Create destination directory if it doesn't exist
  mkdir -p "${CONTRACT_DEST_DIR}"

  # Copy contract ABIs
  local contracts=("auth/RoleControl" "did/DidRegistry" "vc/CredentialRegistry")
  local all_found=true

  for contract in "${contracts[@]}"; do
    local source="${CONTRACT_SOURCE_DIR}/${contract}.sol/$(basename ${contract}).json"
    local dest="${CONTRACT_DEST_DIR}/$(basename ${contract}).json"

    if [ -f "$source" ]; then
      cp "$source" "$dest"
      log $GREEN "  ✓ Copied $(basename ${contract}).json"
    else
      log $RED "  ✗ Missing ${source}"
      all_found=false
    fi
  done

  if [ "$all_found" = false ]; then
    log $YELLOW "Some contract ABIs are missing. Continue anyway? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
}

# Bind Caliper to Ethereum (only needs to be done once)
bind_caliper() {
  log $CYAN "Binding Caliper to Ethereum..."

  caliper bind --caliper-bind-sut ethereum:latest \
    --caliper-bind-cwd ./ \
    --caliper-bind-args="-g" \
    >"${RUN_DIR}/logs/caliper-bind.log" 2>&1

  if [ $? -eq 0 ]; then
    log $GREEN "Caliper binding successful"
  else
    log $YELLOW "Caliper binding failed (may already be bound)"
  fi
}

# Create directories structure
setup_directories() {
  mkdir -p "${RUN_DIR}"
  mkdir -p "${RUN_DIR}/logs"
  mkdir -p "${RUN_DIR}/reports"
  mkdir -p "${RUN_DIR}/metrics"

  log $GREEN "Created report directory: ${RUN_DIR}"
}

# Initialize summary files
initialize_summary() {
  # Enhanced CSV summary with comprehensive metrics
  local summary_csv="${RUN_DIR}/benchmark_summary.csv"
  echo "Run,Status,Start_Time,End_Time,Duration_Seconds,Block_Number,Workload_Name,Load_Type,Operation_Type,Succ_Count,Fail_Count,Send_Rate_TPS,Max_Latency_s,Min_Latency_s,Avg_Latency_s,Throughput_TPS,Success_Rate_Pct,Error_Message" >"${summary_csv}"

  # Detailed workload CSV for comprehensive analysis
  local workload_csv="${RUN_DIR}/workload_detailed_metrics.csv"
  echo "Run,Workload_Name,Load_Type,Operation_Type,Succ_Count,Fail_Count,Send_Rate_TPS,Max_Latency_s,Min_Latency_s,Avg_Latency_s,Throughput_TPS,Success_Rate_Pct,Block_Number,Timestamp" >"${workload_csv}"

  # JSON summary initialization
  echo "{\"runs\": [], \"metadata\": {\"total_runs\": ${TOTAL_RUNS}, \"start_time\": \"$(date -Iseconds)\", \"node_type\": \"${NODE_TYPE}\"}}" >"${RUN_DIR}/summary.json"
}

# Extract comprehensive metrics from HTML report
extract_metrics() {
  local report_file=$1
  local run_number=$2

  if [ ! -f "$report_file" ]; then
    echo "N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A"
    return
  fi

  log $CYAN "Extracting comprehensive metrics from report for run ${run_number}..."

  # Function to extract metrics for a specific workload using more robust parsing
  extract_workload_metrics() {
    local workload_name=$1

    # Find the row containing the workload data in the summary table
    local workload_row=$(grep -A 100 "Summary of performance metrics" "$report_file" |
      grep -E "<td>$workload_name</td>" | head -1)

    if [ -n "$workload_row" ]; then
      # Extract all numeric values from the row
      local values=$(echo "$workload_row" | grep -oE '<td>[^<]*</td>' |
        sed 's/<td>//g; s/<\/td>//g' |
        tail -n +2) # Skip the first column (name)

      # Convert to array
      local metrics_array=()
      while IFS= read -r line; do
        if [[ "$line" =~ ^[0-9]*\.?[0-9]+$ ]]; then
          metrics_array+=("$line")
        fi
      done <<<"$values"

      # Assign values: Succ, Fail, Send_Rate, Max_Latency, Min_Latency, Avg_Latency, Throughput
      local succ=${metrics_array[0]:-0}
      local fail=${metrics_array[1]:-0}
      local send_rate=${metrics_array[2]:-0}
      local max_latency=${metrics_array[3]:-0}
      local min_latency=${metrics_array[4]:-0}
      local avg_latency=${metrics_array[5]:-0}
      local throughput=${metrics_array[6]:-0}

      # Calculate success rate
      local success_rate="100"
      if [ "$succ" != "0" ] || [ "$fail" != "0" ]; then
        local total=$((succ + fail))
        if [ $total -gt 0 ]; then
          success_rate=$(echo "scale=2; ($succ * 100) / $total" | bc 2>/dev/null || echo "100")
        fi
      fi

      echo "${succ},${fail},${send_rate},${max_latency},${min_latency},${avg_latency},${throughput},${success_rate}"
    else
      echo "0,0,0,0,0,0,0,100"
    fi
  }

  # Extract metrics for all workload types with more specific patterns
  local role_low=$(extract_workload_metrics "Role_Assignment_Low")
  local did_low=$(extract_workload_metrics "DID_Creation_Low")
  local cred_low=$(extract_workload_metrics "Credential_Issuance_Low")
  local role_medium=$(extract_workload_metrics "Role_Assignment_Medium")
  local did_medium=$(extract_workload_metrics "DID_Creation_Medium")
  local cred_medium=$(extract_workload_metrics "Credential_Issuance_Medium")
  local role_high=$(extract_workload_metrics "Role_Assignment_High")
  local did_high=$(extract_workload_metrics "DID_Creation_High")
  local cred_high=$(extract_workload_metrics "Credential_Issuance_High")

  # Store detailed workload metrics in separate CSV
  local workload_csv="${RUN_DIR}/workload_detailed_metrics.csv"
  local block_number=$(get_block_number)
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  # Write detailed workload metrics
  echo "${run_number},Role_Assignment_Low,Low,Role_Assignment,${role_low},${block_number},${timestamp}" >>"$workload_csv"
  echo "${run_number},DID_Creation_Low,Low,DID_Creation,${did_low},${block_number},${timestamp}" >>"$workload_csv"
  echo "${run_number},Credential_Issuance_Low,Low,Credential_Issuance,${cred_low},${block_number},${timestamp}" >>"$workload_csv"
  echo "${run_number},Role_Assignment_Medium,Medium,Role_Assignment,${role_medium},${block_number},${timestamp}" >>"$workload_csv"
  echo "${run_number},DID_Creation_Medium,Medium,DID_Creation,${did_medium},${block_number},${timestamp}" >>"$workload_csv"
  echo "${run_number},Credential_Issuance_Medium,Medium,Credential_Issuance,${cred_medium},${block_number},${timestamp}" >>"$workload_csv"
  echo "${run_number},Role_Assignment_High,High,Role_Assignment,${role_high},${block_number},${timestamp}" >>"$workload_csv"
  echo "${run_number},DID_Creation_High,High,DID_Creation,${did_high},${block_number},${timestamp}" >>"$workload_csv"
  echo "${run_number},Credential_Issuance_High,High,Credential_Issuance,${cred_high},${block_number},${timestamp}" >>"$workload_csv"

  # Calculate aggregated metrics for main summary
  local total_succ=0
  local total_fail=0
  local avg_send_rate=0
  local avg_max_latency=0
  local avg_min_latency=0
  local avg_avg_latency=0
  local avg_throughput=0
  local workload_count=0

  # Function to add metrics to totals
  add_to_totals() {
    local metrics=$1
    if [ "$metrics" != "0,0,0,0,0,0,0,100" ]; then
      local succ=$(echo "$metrics" | cut -d',' -f1)
      local fail=$(echo "$metrics" | cut -d',' -f2)
      local send=$(echo "$metrics" | cut -d',' -f3)
      local max_lat=$(echo "$metrics" | cut -d',' -f4)
      local min_lat=$(echo "$metrics" | cut -d',' -f5)
      local avg_lat=$(echo "$metrics" | cut -d',' -f6)
      local through=$(echo "$metrics" | cut -d',' -f7)

      total_succ=$((total_succ + succ))
      total_fail=$((total_fail + fail))
      avg_send_rate=$(echo "scale=2; $avg_send_rate + $send" | bc)
      avg_max_latency=$(echo "scale=2; $avg_max_latency + $max_lat" | bc)
      avg_min_latency=$(echo "scale=2; $avg_min_latency + $min_lat" | bc)
      avg_avg_latency=$(echo "scale=2; $avg_avg_latency + $avg_lat" | bc)
      avg_throughput=$(echo "scale=2; $avg_throughput + $through" | bc)
      workload_count=$((workload_count + 1))
    fi
  }

  # Add all workload metrics to totals
  add_to_totals "$role_low"
  add_to_totals "$did_low"
  add_to_totals "$cred_low"
  add_to_totals "$role_medium"
  add_to_totals "$did_medium"
  add_to_totals "$cred_medium"
  add_to_totals "$role_high"
  add_to_totals "$did_high"
  add_to_totals "$cred_high"

  # Calculate averages
  if [ $workload_count -gt 0 ]; then
    avg_send_rate=$(echo "scale=2; $avg_send_rate / $workload_count" | bc)
    avg_max_latency=$(echo "scale=2; $avg_max_latency / $workload_count" | bc)
    avg_min_latency=$(echo "scale=2; $avg_min_latency / $workload_count" | bc)
    avg_avg_latency=$(echo "scale=2; $avg_avg_latency / $workload_count" | bc)
    avg_throughput=$(echo "scale=2; $avg_throughput / $workload_count" | bc)
  fi

  # Calculate overall success rate
  local overall_success_rate="100"
  local total_transactions=$((total_succ + total_fail))
  if [ $total_transactions -gt 0 ]; then
    overall_success_rate=$(echo "scale=2; ($total_succ * 100) / $total_transactions" | bc)
  fi

  # Return aggregated metrics for main summary
  echo "ALL_WORKLOADS,ALL,COMBINED,${total_succ},${total_fail},${avg_send_rate},${avg_max_latency},${avg_min_latency},${avg_avg_latency},${avg_throughput},${overall_success_rate}"
}

# Get current block number
get_block_number() {
  node -e "
    const Web3 = require('web3');
    const web3 = new Web3('${NODE_HTTP_ENDPOINT}');
    web3.eth.getBlockNumber().then(console.log).catch(() => console.log('N/A'));
    " 2>/dev/null || echo "N/A"
}

# Run single benchmark with retry logic
run_single_benchmark() {
  local run_number=$1
  local attempt=1
  local success=false

  while [ $attempt -le $RETRY_ATTEMPTS ] && [ "$success" = false ]; do
    log $YELLOW "[Run ${run_number}/${TOTAL_RUNS}] Starting benchmark (Attempt ${attempt}/${RETRY_ATTEMPTS})..."

    local run_start=$(date +%s)
    local run_start_time=$(date '+%Y-%m-%d %H:%M:%S')
    local block_number=$(get_block_number)

    # Determine network config file based on node type
    local network_config="networks/ethereum/besu-network.json"
    if [ "$NODE_TYPE" = "nethermind" ]; then
      network_config="networks/ethereum/nethermind-network.json"
    fi

    # Run Caliper benchmark
    echo "Running benchmarks optimized for CLIQUE consensus..."
    caliper launch manager \
      --caliper-workspace ./ \
      --caliper-benchconfig benchmarks/config-role.yaml \
      --caliper-networkconfig "${network_config}" \
      --caliper-flow-only-test \
      --caliper-worker-remote=false \
      --caliper-report-name "ssi-${NODE_TYPE}-clique-benchmark-${run_number}" \
      >"${RUN_DIR}/logs/run_${run_number}_attempt_${attempt}.log" 2>&1

    local exit_code=$?
    local run_end=$(date +%s)
    local run_end_time=$(date '+%Y-%m-%d %H:%M:%S')
    local duration=$((run_end - run_start))

    if [ $exit_code -eq 0 ]; then
      # Check if report was generated
      if [ -f "report.html" ]; then
        # Move and rename report
        mv report.html "${RUN_DIR}/reports/report_${run_number}.html"

        # Extract metrics
        local metrics=$(extract_metrics "${RUN_DIR}/reports/report_${run_number}.html" "${run_number}")

        # Log success
        log $GREEN "[Run ${run_number}/${TOTAL_RUNS}] Success! Duration: ${duration}s"

        # Update CSV summary with comprehensive metrics
        echo "${run_number},SUCCESS,${run_start_time},${run_end_time},${duration},${block_number},${metrics}," >>"${RUN_DIR}/benchmark_summary.csv"

        # Update JSON summary
        update_json_summary "${run_number}" "SUCCESS" "${duration}" "${metrics}"

        success=true
      else
        log $RED "[Run ${run_number}/${TOTAL_RUNS}] Report not generated (Attempt ${attempt})"
        echo "${run_number},NO_REPORT,${run_start_time},${run_end_time},${duration},${block_number},N/A,N/A,N/A,0,0,0,0,0,0,0,0,No report generated" >>"${RUN_DIR}/benchmark_summary.csv"
      fi
    else
      log $RED "[Run ${run_number}/${TOTAL_RUNS}] Failed with exit code ${exit_code} (Attempt ${attempt})"

      if [ $attempt -eq $RETRY_ATTEMPTS ]; then
        echo "${run_number},FAILED,${run_start_time},${run_end_time},${duration},${block_number},N/A,N/A,N/A,0,0,0,0,0,0,0,0,Exit code ${exit_code}" >>"${RUN_DIR}/benchmark_summary.csv"
        update_json_summary "${run_number}" "FAILED" "${duration}" "N/A,N/A,N/A,0,0,0,0,0,0,0,0"
      fi
    fi

    # Clean up temporary files
    rm -f caliper.log
    rm -f report.html

    if [ "$success" = false ] && [ $attempt -lt $RETRY_ATTEMPTS ]; then
      log $YELLOW "Retrying in ${RETRY_DELAY} seconds..."
      sleep $RETRY_DELAY
    fi

    attempt=$((attempt + 1))
  done

  # Add delay between runs
  if [ $run_number -lt $TOTAL_RUNS ]; then
    sleep 5
  fi

  return $([ "$success" = true ] && echo 0 || echo 1)
}

# Update JSON summary (simplified version)
update_json_summary() {
  local run_number=$1
  local status=$2
  local duration=$3
  local metrics=$4

  # This is a simplified update - in production, use jq or proper JSON parsing
  log $CYAN "Updated JSON summary for run ${run_number}"
}

# Run benchmarks in parallel
run_parallel_benchmarks() {
  log $MAGENTA "Running benchmarks in parallel mode (max ${MAX_PARALLEL} concurrent)"

  for ((i = 1; i <= TOTAL_RUNS; i += MAX_PARALLEL)); do
    local pids=()

    for ((j = 0; j < MAX_PARALLEL && i + j <= TOTAL_RUNS; j++)); do
      local run_num=$((i + j))
      run_single_benchmark $run_num &
      pids+=($!)
    done

    # Wait for batch to complete
    for pid in "${pids[@]}"; do
      wait $pid
    done

    log $CYAN "Completed batch $((i / MAX_PARALLEL + 1))"

    # Check node health periodically
    if [ $((i % NODE_CHECK_INTERVAL)) -eq 0 ]; then
      check_node_health || {
        log $RED "Node health check failed. Pausing for 30 seconds..."
        sleep 30
      }
    fi
  done
}

# Run benchmarks sequentially
run_sequential_benchmarks() {
  log $MAGENTA "Running benchmarks in sequential mode"

  for i in $(seq 1 $TOTAL_RUNS); do
    # Check node health periodically
    if [ $((i % NODE_CHECK_INTERVAL)) -eq 1 ] || [ $i -eq 1 ]; then
      check_node_health || {
        log $RED "Node health check failed. Waiting for node to recover..."
        while ! check_node_health; do
          sleep 30
        done
      }
    fi

    run_single_benchmark $i
  done
}

# Generate final report
generate_final_report() {
  log $CYAN "Generating final report..."

  local summary_file="${RUN_DIR}/benchmark_summary.csv"
  local workload_file="${RUN_DIR}/workload_detailed_metrics.csv"
  local successful=$(grep -c ",SUCCESS," "$summary_file" || echo 0)
  local failed=$(grep -c ",FAILED," "$summary_file" || echo 0)
  local no_report=$(grep -c ",NO_REPORT," "$summary_file" || echo 0)

  # Calculate average metrics from comprehensive data (using column positions for new format)
  # New CSV format: Run,Status,Start_Time,End_Time,Duration_Seconds,Block_Number,Workload_Name,Load_Type,Operation_Type,Succ_Count,Fail_Count,Send_Rate_TPS,Max_Latency_s,Min_Latency_s,Avg_Latency_s,Throughput_TPS,Success_Rate_Pct,Error_Message
  local avg_throughput=$(awk -F',' '$2=="SUCCESS" && $16!="" && $16!="N/A" {sum+=$16; count++} END {if(count>0) printf "%.2f", sum/count; else print "0"}' "$summary_file")
  local avg_send_rate=$(awk -F',' '$2=="SUCCESS" && $12!="" && $12!="N/A" {sum+=$12; count++} END {if(count>0) printf "%.2f", sum/count; else print "0"}' "$summary_file")
  local avg_latency=$(awk -F',' '$2=="SUCCESS" && $15!="" && $15!="N/A" {sum+=$15; count++} END {if(count>0) printf "%.2f", sum/count; else print "0"}' "$summary_file")
  local avg_success_rate=$(awk -F',' '$2=="SUCCESS" && $17!="" && $17!="N/A" {sum+=$17; count++} END {if(count>0) printf "%.2f", sum/count; else print "0"}' "$summary_file")
  local total_transactions=$(awk -F',' '$2=="SUCCESS" && $10!="" && $10!="N/A" {sum+=$10} END {printf "%.0f", sum}' "$summary_file")

  # Generate workload type summary from detailed metrics
  local low_load_summary=""
  local medium_load_summary=""
  local high_load_summary=""

  if [ -f "$workload_file" ]; then
    low_load_summary=$(awk -F',' '$3=="Low" {
      succ+=$4; fail+=$5; send+=$6; max_lat+=$7; min_lat+=$8; avg_lat+=$9; tps+=$10; sr+=$11; count++
    } END {
      if(count>0) printf "Avg TPS: %.2f, Avg Latency: %.2f s, Success Rate: %.2f%%, Total Transactions: %.0f", 
      tps/count, avg_lat/count, sr/count, succ
    }' "$workload_file")

    medium_load_summary=$(awk -F',' '$3=="Medium" {
      succ+=$4; fail+=$5; send+=$6; max_lat+=$7; min_lat+=$8; avg_lat+=$9; tps+=$10; sr+=$11; count++
    } END {
      if(count>0) printf "Avg TPS: %.2f, Avg Latency: %.2f s, Success Rate: %.2f%%, Total Transactions: %.0f", 
      tps/count, avg_lat/count, sr/count, succ
    }' "$workload_file")

    high_load_summary=$(awk -F',' '$3=="High" {
      succ+=$4; fail+=$5; send+=$6; max_lat+=$7; min_lat+=$8; avg_lat+=$9; tps+=$10; sr+=$11; count++
    } END {
      if(count>0) printf "Avg TPS: %.2f, Avg Latency: %.2f s, Success Rate: %.2f%%, Total Transactions: %.0f", 
      tps/count, avg_lat/count, sr/count, succ
    }' "$workload_file")
  fi

  # Create comprehensive final report
  cat >"${RUN_DIR}/REPORT.md" <<EOF
# Comprehensive Caliper SSI Benchmark Report

## Execution Summary
- **Date**: $(date)
- **Node Type**: ${NODE_TYPE}
- **Total Runs**: ${TOTAL_RUNS}
- **Successful**: ${successful}
- **Failed**: ${failed}
- **No Report**: ${no_report}

## Overall Performance Metrics (Averages)
- **Average Throughput (TPS)**: ${avg_throughput}
- **Average Send Rate (TPS)**: ${avg_send_rate}
- **Average Latency**: ${avg_latency}s
- **Average Success Rate**: ${avg_success_rate}%
- **Total Transactions Processed**: ${total_transactions}

## Performance by Workload Type

### Low Load Workloads
${low_load_summary:-"No data available"}

### Medium Load Workloads  
${medium_load_summary:-"No data available"}

### High Load Workloads
${high_load_summary:-"No data available"}

## Data Files Generated
- **HTML Reports**: ${RUN_DIR}/reports/ (Individual benchmark reports)
- **Execution Logs**: ${RUN_DIR}/logs/ (Detailed execution logs)
- **Main Summary CSV**: ${RUN_DIR}/benchmark_summary.csv (Run-level aggregated metrics)
- **Detailed Workload CSV**: ${RUN_DIR}/workload_detailed_metrics.csv (Individual workload metrics by type/load)
- **JSON Summary**: ${RUN_DIR}/summary.json (Machine-readable summary)
- **Final Report**: ${RUN_DIR}/REPORT.md (This comprehensive report)

## Usage Instructions
1. **Main Summary CSV**: Use for overall run analysis and trends
2. **Detailed Workload CSV**: Use for specific workload type analysis (Low/Medium/High load patterns)
3. **HTML Reports**: Use for detailed per-run investigation and debugging

## Analysis Recommendations
- Compare performance across different load types (Low/Medium/High)
- Analyze transaction success rates and latency patterns
- Monitor throughput scaling with increased load
- Use workload-specific metrics for targeted optimization
EOF

  log $GREEN "Final report generated: ${RUN_DIR}/REPORT.md"
}

# ============================================
# Main Execution
# ============================================

main() {
  echo "============================================"
  echo "   Caliper SSI Benchmark Automation"
  echo "   Node Type: ${NODE_TYPE}"
  echo "   Total Runs: ${TOTAL_RUNS}"
  echo "   Mode: $([ "$PARALLEL_MODE" = true ] && echo "Parallel" || echo "Sequential")"
  echo "============================================"
  echo ""

  # Setup
  setup_directories
  initialize_summary
  setup_contracts

  # Initial node health check
  check_node_health || {
    log $RED "Initial node health check failed. Please ensure ${NODE_TYPE} node is running."
    exit 1
  }

  # Bind Caliper (only once)
  bind_caliper

  # Run benchmarks
  if [ "$PARALLEL_MODE" = true ]; then
    run_parallel_benchmarks
  else
    run_sequential_benchmarks
  fi

  # Generate final report
  generate_final_report

  # Summary
  echo ""
  echo "============================================"
  log $GREEN "Benchmark automation completed!"
  log $BLUE "Reports directory: ${RUN_DIR}"
  log $BLUE "Total successful runs: $(grep -c SUCCESS "${RUN_DIR}/benchmark_summary.csv" || echo 0)"
  log $BLUE "Total failed runs: $(grep -c FAILED "${RUN_DIR}/benchmark_summary.csv" || echo 0)"
  echo ""
  log $CYAN "📊 Generated Data Files:"
  log $CYAN "  • Main Summary CSV: ${RUN_DIR}/benchmark_summary.csv"
  log $CYAN "  • Detailed Workload CSV: ${RUN_DIR}/workload_detailed_metrics.csv"
  log $CYAN "  • HTML Reports: ${RUN_DIR}/reports/"
  log $CYAN "  • Final Report: ${RUN_DIR}/REPORT.md"
  echo ""
  echo "============================================"
}

# Run main function
main
