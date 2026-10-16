import { closePool, pool } from "../src/lib/db";
import { sendDigests } from "../src/lib/alerts";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

sendDigests(pool(), appUrl, (m) => console.log(m))
  .then((n) => console.log(`${n} e-mails enviados`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
