interface UmamiEventData {
  [key: string]: string | number | boolean | null | undefined;
}

interface UmamiTracker {
  track: (eventName: string, eventData?: UmamiEventData) => void;
}

interface Window {
  umami?: UmamiTracker;
}
