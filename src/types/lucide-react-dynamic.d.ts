// lucide-react's bare "lucide-react/dynamic" specifier resolves fine in bundler
// (browser) contexts but fails under real Node.js module resolution during SSR —
// confirmed directly against Node (no `exports` map on the package, and ESM
// resolution doesn't probe extensions for a bare specifier). The runtime imports
// use the extension-qualified "lucide-react/dynamic.mjs" instead, which resolves
// correctly everywhere; this just points TypeScript at the already-correct types
// for that same module so the two files importing it don't lose type coverage.
declare module "lucide-react/dynamic.mjs" {
  export * from "lucide-react/dynamic";
}
