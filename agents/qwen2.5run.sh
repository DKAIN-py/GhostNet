#!/bin/bash

# Configuration - Update paths if needed
MODEL_PATH="${HOME}/models/qwen_2.5_coder_7b/qwen2.5-coder-7b-instruct-q4_k_m.gguf"
SERVER_BIN="llama-server"
LOG_FILE="${HOME}/models/autonet-cascade-server.log"

# Function to start the server in the background
start_server() {
    if pgrep -x "$SERVER_BIN" > /dev/null; then
        echo "[-] The brain is already awake (llama-server is running)."
    else
        echo "[+] Waking up AutoNet Cascade Brain..."

        # Key Flags Explained:
        # -m                 : Model path
        # -ngl 99            : Offload all model layers to VRAM
        # -c 4096            : 4K context window (lowers VRAM overhead for fast execution)
        # --reasoning-budget 0 : Disables extended thinking tokens for instant JSON outputs
        # -fa on             : Enables Flash Attention for faster processing
        # --host 0.0.0.0     : Binds server to all interfaces
        # --port 8080        : Port for backend HTTP requests
        # --jinja            : Native Jinja chat template parsing

        nohup $SERVER_BIN \
            -m "$MODEL_PATH" \
            -ngl 99 \
            -c 8188 \
            -n 4096 \
            --reasoning-budget 0 \
            -np 1 \
            -fa on \
            --host 0.0.0.0 \
            --port 8080 \
            --jinja > "$LOG_FILE" 2>&1 &

        echo "[!] AutoNet Engine active at http://localhost:8080 (Log: $LOG_FILE)"
    fi
}

# Function to stop the server
stop_server() {
    if pgrep -x "$SERVER_BIN" > /dev/null; then
        echo "[-] Putting the AutoNet brain to sleep..."
        pkill -x "$SERVER_BIN"
        echo "[+] Done."
    else
        echo "[?] The brain is already sleeping."
    fi
}

# Function to check status and GPU load
status_server() {
    if pgrep -x "$SERVER_BIN" > /dev/null; then
        echo "[!] Status: Active and listening on port 8080."
        echo "--- GPU VRAM & Utilization ---"
        nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader
    else
        echo "[!] Status: Offline."
    fi
}

# Logic for handling flags
case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    status)
        status_server
        ;;
    restart)
        stop_server
        sleep 2
        start_server
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        exit 1
esac
