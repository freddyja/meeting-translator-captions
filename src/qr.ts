import { renderSVG } from "uqr";

/** Large, high-contrast QR of the current room’s TV caption URL. */
export function tvQrSvg(url: string, label = "QR code for the TV caption page"): string {
  const aria = label.replace(/"/g, "&quot;");
  return renderSVG(url, {
    border: 4,
    ecc: "M",
    pixelSize: 1,
    whiteColor: "#ffffff",
    blackColor: "#0b1214",
  }).replace(
    "<svg ",
    `<svg role="img" aria-label="${aria}" shape-rendering="crispEdges" `,
  );
}

export const qrSvg = tvQrSvg;
