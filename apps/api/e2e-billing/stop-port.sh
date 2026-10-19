#!/usr/bin/env bash
# Mata só o processo que escuta na porta pedida (3334 = API, 3999 = Resend falso).
# Mac/Linux: lsof. Git Bash no Windows: netstat + taskkill.
PORT="${1:?porta}"
listening() {
  if command -v lsof > /dev/null 2>&1; then lsof -ti "tcp:$PORT" -sTCP:LISTEN > /dev/null 2>&1
  else netstat -ano | grep -qE "(0.0.0.0|127.0.0.1|\[::\]):$PORT .*LISTEN"; fi
}
if command -v lsof > /dev/null 2>&1; then
  PIDS=$(lsof -ti "tcp:$PORT" -sTCP:LISTEN)
  [ -n "$PIDS" ] && kill $PIDS && echo "porta $PORT: PID $PIDS encerrado"
else
  PID=$(netstat -ano | grep -E "(0.0.0.0|127.0.0.1|\[::\]):$PORT " | grep LISTEN | awk '{print $5}' | head -1)
  if [ -n "$PID" ] && [ "$PID" != "0" ]; then
    taskkill //F //T //PID "$PID" > /dev/null 2>&1 || taskkill //F //PID "$PID" > /dev/null 2>&1
    echo "porta $PORT: PID $PID encerrado"
  fi
fi
for i in $(seq 1 20); do
  listening || exit 0
  node -e "setTimeout(()=>{},500)"
done
echo "porta $PORT ainda ocupada"; exit 1
