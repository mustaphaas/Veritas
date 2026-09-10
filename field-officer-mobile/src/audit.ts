import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";
import { Platform } from "react-native";

import type { DeviceAudit } from "./types";

export const FORM_SCHEMA_VERSION = "2026.09.1";
export const OFFICER_ID = "FO-0001";
export const CONSULTANT_FIRM = "Supreme Way";
export const GEOFENCE_RADIUS_METRES = 250;

export const timezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function newSessionId() {
  return Crypto.randomUUID();
}

export function deviceAudit(): DeviceAudit {
  return {
    androidId: Platform.OS === "android" ? Application.getAndroidId() : null,
    manufacturer: Device.manufacturer,
    brand: Device.brand,
    modelName: Device.modelName,
    deviceName: Device.deviceName,
    osName: Device.osName,
    osVersion: Device.osVersion,
    osBuildId: Device.osBuildId,
    isPhysicalDevice: Device.isDevice,
    appVersion: Application.nativeApplicationVersion,
    appBuild: Application.nativeBuildVersion,
    formSchemaVersion: FORM_SCHEMA_VERSION,
  };
}

export async function networkAudit() {
  const [state, localIpAddress] = await Promise.all([
    Network.getNetworkStateAsync(),
    Network.getIpAddressAsync().catch(() => "0.0.0.0"),
  ]);
  return {
    localIpAddress,
    networkType: String(state.type),
  };
}

export async function sha256Text(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export async function sha256File(uri: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
