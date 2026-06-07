import { defineConfig } from "vite";

export default defineConfig({
  base: "https://xc-public.oss-cn-chengdu.aliyuncs.com/assets/assets/",
  assetsInclude: ["**/*.spz", "**/*.glb", "**/*.gltf", "**/*.fbx"],
  build: {
    assetsDir: "",
  },
});
