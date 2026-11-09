import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import type { ReleaseVideo } from "@/lib/app-update";

/** Mounted only while the release dialog is open. Never starts playback on mount. */
export function ReleaseTutorialVideo({ video, base }: { video: ReleaseVideo; base: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    // React can replay effects in development/HMR. Restore what cleanup detached;
    // otherwise the visible native controls are left without a media source.
    const supportsOpus = video.webm && player.canPlayType('video/webm; codecs="vp9, opus"');
    player.src = `${base}${supportsOpus ? video.webm : video.src}`;
    player.load();
    return () => {
      player.pause();
      player.removeAttribute("src");
      player.load(); // Cancel buffering and pending play promises on close/unmount.
    };
  }, [base, video.src, video.webm]);

  return <div className="space-y-3">
    <video ref={ref} src={`${base}${video.src}`} className="aspect-video w-full rounded-xl border bg-black"
      controls playsInline preload="metadata" autoPlay={false} poster={`${base}${video.poster}`} aria-label={video.title}
      onError={() => { setError("O vídeo não carregou. Confira a conexão ou baixe o arquivo abaixo."); }}>
      <track kind="captions" src={`${base}${video.captions}`} srcLang="pt-BR" label="Português (Brasil)" />
      Seu navegador não suporta vídeo. <a href={`${base}${video.src}`}>Baixar tutorial em MP4</a>.
    </video>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Volume2 className="h-3.5 w-3.5" />O vídeo só começa ao clicar. Fechar esta janela interrompe a reprodução.</p>
    <a className="inline-block text-xs text-primary underline-offset-4 hover:underline" href={`${base}${video.src}`} download>Baixar vídeo para assistir depois</a>
  </div>;
}
