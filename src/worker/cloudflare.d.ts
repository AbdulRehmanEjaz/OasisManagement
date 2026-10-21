declare module "cloudflare:workers" {
  export const env: { IMAGES: import("@cloudflare/workers-types").ImagesBinding };
}
