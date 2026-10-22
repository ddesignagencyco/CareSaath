export interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Current device position, with messages a caregiver can act on. */
export function getPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser can't share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission is off. Allow location for this site in your browser settings."
              : err.code === err.TIMEOUT
                ? "Couldn't get your location in time. Move near a window and try again."
                : "Your location isn't available right now. Please try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}
