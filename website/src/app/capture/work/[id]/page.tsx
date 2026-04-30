import { notFound } from "next/navigation";
import { getWork } from "@/lib/collection";
import WorkDisplay from "@/components/WorkDisplay";

export const dynamic = "force-dynamic";

/**
 * Bare capture route for preview PNG generation.
 *
 * The generator script navigates here, waits for the render to stabilize, and
 * screenshots the `#capture-target` element. LayoutShell skips nav/footer for
 * `/capture/*` paths.
 */
export default async function CaptureWorkPage({
  params,
}: {
  params: { id: string };
}) {
  const work = await getWork(params.id);
  if (!work) notFound();

  return (
    <>
      <style>{`
        html, body { margin: 0 !important; padding: 0 !important; background: #FFFFFF !important; }
        main { padding: 0 !important; }
        #capture-target { width: 1000px; height: 1000px; background: #FFFFFF; position: relative; overflow: hidden; }
        #capture-target > * { width: 100% !important; height: 100% !important; }
        #capture-target svg, #capture-target img, #capture-target canvas, #capture-target iframe {
          width: 100% !important;
          height: 100% !important;
        }
        #capture-target img { object-fit: cover; }
      `}</style>
      <div id="capture-target">
        {/* size="detail" keeps live rendering — gallery is now preview-PNG.
            CSS in #capture-target overrides any intrinsic size to 1000×1000. */}
        <WorkDisplay work={work} size="detail" framed={false} showPlacard={false} />
      </div>
    </>
  );
}
