# CV Parsing & Matching

## Architectural Roadmap

- **CV Uploads**: Currently implemented as a synchronous API route with inline `worker_threads` for parsing to avoid event loop blocking. As scale increases, this should be moved to a decoupled Background Job / Microservice architecture (uploading to Supabase Storage -> async queue processing) to fully resolve potential HTTP load-balancer timeouts.
