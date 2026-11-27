import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { referenceCatalog } from "../src/lib/reference-catalog";
async function main() {
  await mkdir("test-results", { recursive: true });
  const references = await Promise.all(
    referenceCatalog.map(async (r) => ({
      ...r,
      image: (
        await sharp("public" + r.image)
          .jpeg()
          .toBuffer()
      ).toString("base64"),
    })),
  );
  await writeFile(
    "test-results/ai-references.json",
    JSON.stringify(references),
  );
  console.log("Prepared local, non-customer inference fixtures.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
