cd wev-bulletin && NODE_ENV=production PORT=3100 dotenv -e ../.env -- npm run start > ../server.log 2>&1 &
# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..30}; do
  if curl -s http://localhost:3100/api/bulletin\?locale\=en > /dev/null; then
    echo "Server is up"
    break
  fi
  sleep 2
done

endpoints=(
  "/api/bulletin?locale=en"
  "/api/bulletin?locale=en&postedWithin=1-week"
  "/api/bulletin?locale=en&q=Community%20Builder%2025"
  "/api/bulletin?locale=en&works=remote"
  "/api/bulletin?locale=en&orgs=WEV%20Partner%201"
  "/api/bulletin?locale=en&page=2"
)

for ep in "${endpoints[@]}"; do
  echo "Endpoint: $ep"
  res=$(curl -s "http://localhost:3100$ep")
  if echo "$res" | jq -e '.error' > /dev/null 2>&1; then
    error_msg=$(echo "$res" | jq -r '.error')
    echo "Error: $error_msg"
  else
    total=$(echo "$res" | jq '.total // 0')
    first_title=$(echo "$res" | jq -r '.jobs[0].job_title // "N/A"')
    echo "Total: $total, First Job Title: $first_title"
  fi
  echo "---"
done

pkill -f "next-server" || true
