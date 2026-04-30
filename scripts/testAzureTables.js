import { TableClient } from "@azure/data-tables";

const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;

async function test() {
  const client = TableClient.fromConnectionString(conn, "sentimentWatchList");
  const entities = client.listEntities();
  for await (const e of entities) {
    console.log("Entity:", e);
    break;
  }
  console.log("Azure Table Storage connection OK");
}

test().catch(err => console.error("Azure test failed:", err));
