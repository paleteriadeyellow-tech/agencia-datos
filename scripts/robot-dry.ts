import "dotenv/config";
import { buildRobotReport, formatRobotSummary } from "../src/lib/robot";
import { AGENCIES, type AgencySlug } from "../src/lib/agencies";

async function main() {
  for (const slug of Object.keys(AGENCIES) as AgencySlug[]) {
    const r = await buildRobotReport(slug);
    console.log(formatRobotSummary(r, "https://agencia-datos.vercel.app"));
    console.log(`(detalle: ${r.creators.length} marcados; ejemplo de mensaje:)`);
    if (r.creators[0]) console.log(r.creators[0].message, "\n", r.creators[0].waLink ? "link OK" : "sin link");
    console.log("--------");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
