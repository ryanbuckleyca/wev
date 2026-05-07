import { fetchServerBulletinJobs } from "./wev-bulletin/lib/bulletin/server-data";
fetchServerBulletinJobs("en")
  .then((res) => console.log(JSON.stringify(res, null, 2)))
  .catch((err) => console.error(err));
