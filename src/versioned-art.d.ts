declare module 'virtual:versioned-art' {
 const entries: Record<string, import('./render/assets').AssetEntry>;
 export default entries;
}
