import { supabase } from "@/integrations/supabase/client";
import { reverseGeocodeAttendanceLocation } from "@/lib/api/geocoding.functions";

export type AttendanceLocation = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  address: string | null;
};

const roundCoordinate = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const locationErrorMessage = (error: GeolocationPositionError) => {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission is required to check in or out. Allow location access and try again.";
    case error.POSITION_UNAVAILABLE:
      return "Your location is unavailable. Turn on location services and try again.";
    case error.TIMEOUT:
      return "Location could not be confirmed in time. Check your signal and try again.";
    default:
      return "Unable to capture your location. Check location services and try again.";
  }
};

const captureCoordinates = () =>
  new Promise<Omit<AttendanceLocation, "address">>((resolve, reject) => {
    if (typeof window === "undefined" || !window.navigator.geolocation) {
      reject(new Error("Location services are not supported by this browser."));
      return;
    }

    if (!window.isSecureContext) {
      reject(new Error("Location check-in requires a secure HTTPS connection."));
      return;
    }

    window.navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude, accuracy } = coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          !Number.isFinite(accuracy) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180 ||
          accuracy < 0
        ) {
          reject(new Error("Your device returned an invalid location. Please try again."));
          return;
        }

        resolve({
          latitude: roundCoordinate(latitude),
          longitude: roundCoordinate(longitude),
          accuracyM: Math.round(accuracy * 10) / 10,
        });
      },
      (error) => reject(new Error(locationErrorMessage(error))),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      },
    );
  });

export const getCurrentAttendanceLocation = async (): Promise<AttendanceLocation> => {
  const coordinates = await captureCoordinates();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) return { ...coordinates, address: null };

  try {
    const result = await reverseGeocodeAttendanceLocation({
      data: {
        accessToken,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
    });
    return { ...coordinates, address: result.address };
  } catch (error) {
    console.warn("Attendance address lookup failed; coordinates were retained.", error);
    return { ...coordinates, address: null };
  }
};

export const attendanceMapUrl = (latitude: number, longitude: number) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;

export const attendanceAccuracyLabel = (accuracyM?: number | null) =>
  accuracyM == null ? "" : `Accurate to about ${Math.max(Math.round(accuracyM), 1)} m`;
