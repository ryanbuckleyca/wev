const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_PROD_URL;
const key = process.env.SUPABASE_PROD_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function main() {
  const { data: allOrgs, error } = await supabase
    .from("organizations")
    .select("slug, name, location, municipality, province")
    .not("location", "is", null)
    .not("location", "eq", "")
    .is("municipality", null);

  if (error) {
    console.error(error);
    return;
  }

  console.log(
    `Found ${allOrgs.length} organizations with location set but municipality null`,
  );
  for (let i = 0; i < Math.min(20, allOrgs.length); i++) {
    const org = allOrgs[i];
    console.log(`- ${org.name} (${org.slug}): location="${org.location}"`);
  }
}

main();
