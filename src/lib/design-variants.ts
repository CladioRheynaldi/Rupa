export type DesignVariant = { assetId: string; seed: number; label?: string; instruction?: string };

// Run serially: this prototype shares one GPU with the analysis model.
export async function generateVariants(
  count: number,
  firstSeed: number,
  generate: (seed: number, index: number) => Promise<DesignVariant>,
  progress: (variants: DesignVariant[], attempted: number) => Promise<void>,
) {
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("Jumlah variasi tidak valid");
  const variants: DesignVariant[] = [];
  let failures = 0;
  for (let i = 0; i < count; i++) {
    try { variants.push(await generate((firstSeed + i * 104729) % 2147483648, i)); }
    catch { failures++; }
    await progress([...variants], i + 1);
  }
  return { variants, failures };
}
