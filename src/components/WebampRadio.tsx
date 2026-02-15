import { useEffect, useRef, useState } from "react";
import RadioPlayer from "./RadioPlayer";
import "./WebampRadio.css";

const STREAM_URL = "https://radio.yabbyville.xyz/live";
const SKINS_PATH = "/skins";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebampInstance = any;

const DESKTOP_QUERY = "(min-width: 768px)";

interface Skin {
  url: string;
  name: string;
}

// Format filename to readable name (e.g., "My_Cool_Skin.wsz" -> "My Cool Skin")
const formatSkinName = (filename: string): string =>
  filename.replace(".wsz", "").replace(/_/g, " ");

// Generate skin list from public/skins folder
const generateSkinsList = (): Skin[] => [
  { url: `${SKINS_PATH}/Construction_Paper_Beach.wsz`, name: formatSkinName("Construction_Paper_Beach.wsz") },
  { url: `${SKINS_PATH}/Dolphin_Trio.wsz`, name: formatSkinName("Dolphin_Trio.wsz") },
  { url: `${SKINS_PATH}/Flat_Slopey_Green_and_Black_Version.wsz`, name: formatSkinName("Flat_Slopey_Green_and_Black_Version.wsz") },
  { url: `${SKINS_PATH}/Frutiger Aero.wsz`, name: formatSkinName("Frutiger Aero.wsz") },
  { url: `${SKINS_PATH}/Infinite.wsz`, name: formatSkinName("Infinite.wsz") },
  { url: `${SKINS_PATH}/Mac-AMP-r2.wsz`, name: formatSkinName("Mac-AMP-r2.wsz") },
  { url: `${SKINS_PATH}/MountainDew_v1.1.wsz`, name: formatSkinName("MountainDew_v1.1.wsz") },
  { url: `${SKINS_PATH}/New_Idea_3_-_Alien_Metalloid_.wsz`, name: formatSkinName("New_Idea_3_-_Alien_Metalloid_.wsz") },
  { url: `${SKINS_PATH}/OS8 AMP - Aquamarine.wsz`, name: formatSkinName("OS8 AMP - Aquamarine.wsz") },
  { url: `${SKINS_PATH}/Perpenvertiagonal_Perspectives.wsz`, name: formatSkinName("Perpenvertiagonal_Perspectives.wsz") },
  { url: `${SKINS_PATH}/Simpsons.wsz`, name: formatSkinName("Simpsons.wsz") },
  { url: `${SKINS_PATH}/Warner_Bros_Scooby-Doo.wsz`, name: formatSkinName("Warner_Bros_Scooby-Doo.wsz") },
  { url: `${SKINS_PATH}/cuteamp.wsz`, name: formatSkinName("cuteamp.wsz") },
  { url: `${SKINS_PATH}/forums_winamp_com.wsz`, name: formatSkinName("forums_winamp_com.wsz") },
  { url: `${SKINS_PATH}/os8_amp_v1_5.wsz`, name: formatSkinName("os8_amp_v1_5.wsz") },
];

interface WebampRadioProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onLoadingChange?: (loading: boolean) => void;
  onErrorChange?: (error: string | null) => void;
}

const WebampRadio: React.FC<WebampRadioProps> = ({
  containerRef,
  onLoadingChange,
  onErrorChange,
}) => {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches
  );

  const webampRef = useRef<WebampInstance>(null);
  const hasRenderedRef = useRef(false);

  // --- Responsive: track desktop vs mobile ---
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // --- Auto-load Webamp on desktop ---
  useEffect(() => {
    if (!isDesktop) return;
    if (hasRenderedRef.current) return;
    if (!containerRef.current) return;

    const container = containerRef.current;
    let disposed = false;

    const initWebamp = async () => {
      onLoadingChange?.(true);
      onErrorChange?.(null);

      try {
        const mod = await import("webamp/butterchurn");
        const WebampClass = mod.default || mod;

        const butterchurn = await import("butterchurn");
        const presetsMod = await import("butterchurn-presets");
        const presetMap = presetsMod.default || presetsMod;

        if (disposed) return;

        const skins = generateSkinsList();
        const randomSkin = skins[Math.floor(Math.random() * skins.length)];

        const webamp = new WebampClass({
          initialSkin: randomSkin,
          availableSkins: skins,
          initialTracks: [
            {
              metaData: {
                artist: "YabbyVille",
                title: "Radio",
              },
              url: STREAM_URL,
            },
          ],
          windowLayout: {
            main: {
              position: { top: 0, left: 0 },
              shadeMode: false,
              closed: false,
            },
            equalizer: {
              position: { top: 230, left: 0 },
              shadeMode: false,
              closed: true,
            },
            playlist: {
              position: { top: 28, left: 0 },
              shadeMode: false,
              size: { extraHeight: 3, extraWidth: 11 },
              closed: true,
            },
            milkdrop: {
              position: { top: 0, left: 550 },
              size: { extraWidth: 8, extraHeight: 4 },
              closed: false,
            },
          },
          enableDoubleSizeMode: true,
          __butterchurnOptions: {
            importButterchurn: () => Promise.resolve(butterchurn),
            getPresets: async () => {
              return Object.keys(presetMap).map((name) => ({
                name,
                butterchurnPresetObject: presetMap[name],
              }));
            },
            butterchurnOpen: true,
          },
        });

        if (disposed) return;

        await webamp.renderWhenReady(container);

        webampRef.current = webamp;
        hasRenderedRef.current = true;
      } catch (err) {
        if (!disposed) {
          console.error("Webamp init failed:", err);
          onErrorChange?.("Failed to initialize the radio player.");
        }
      } finally {
        if (!disposed) {
          onLoadingChange?.(false);
        }
      }
    };

    initWebamp();

    return () => {
      disposed = true;
    };
  }, [isDesktop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (webampRef.current) {
        try {
          webampRef.current.dispose();
        } catch {
          // Webamp dispose may fail silently
        }
      }
    };
  }, []);

  // On desktop, Webamp renders directly into containerRef (return null)
  // On mobile, render RadioPlayer
  return isDesktop ? null : <RadioPlayer />;
};

export default WebampRadio;
