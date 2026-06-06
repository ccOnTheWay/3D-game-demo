import { defineConfig } from "vite";

export default defineConfig({
  base: "/3D-game-demo/",
  assetsInclude: ["**/*.spz", "**/*.glb", "**/*.gltf", "**/*.fbx"],
});
