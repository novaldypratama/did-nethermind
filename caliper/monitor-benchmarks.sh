#!/bin/bash

# Monitor running benchmarks in real-time

REPORT_DIR=$(ls -td benchmark-reports/run_* 2>/dev/null | head -1)

if [ -z "$REPORT_DIR" ]; then
  echo "No active benchmark runs found"
  exit 1
fi

watch -n 2 "
echo '=== Benchmark Progress ==='
echo 'Directory: $REPORT_DIR'
echo ''
echo 'Completed Runs:'
ls -1 $REPORT_DIR/reports/*.html 2>/dev/null | wc -l
echo ''
echo 'Last 5 Entries:'
tail -5 $REPORT_DIR/benchmark_summary.csv | column -t -s','
echo ''
echo 'Current Log:'
tail -5 $REPORT_DIR/logs/run_*.log 2>/dev/null | tail -20
"
