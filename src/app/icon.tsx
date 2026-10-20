import { appIcon } from "./app-icon";

// /icon/192 and /icon/512: the manifest and the notifications use these.
export function generateImageMetadata() {
  return [192, 512].map((s) => ({ id: String(s), size: { width: s, height: s }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return appIcon(Number(await id));
}
