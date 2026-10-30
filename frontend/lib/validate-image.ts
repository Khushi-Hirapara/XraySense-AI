/** Client-side validation for chest X-ray uploads (mirrors backend rules). */

export const MAX_XRAY_SIZE_MB = 20;

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/pjpeg",
  "image/x-png",
  "application/dicom",
  "application/dicom+json",
  "application/octet-stream",
]);

const ACCEPTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".dcm",
  ".dicom",
]);

export const ACCEPT_FILE_ATTRIBUTE =
  "image/png,image/jpeg,.jpg,.jpeg,.png,.dcm,.dicom,application/dicom";

export type ImageValidationResult =
  | { valid: true }
  | { valid: false; message: string };

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function isDicomFile(file: File): boolean {
  const ext = fileExtension(file.name);
  if (ext === ".dcm" || ext === ".dicom") return true;
  const mime = file.type.toLowerCase();
  return mime === "application/dicom" || mime === "application/dicom+json";
}

/** Validate file type (MIME + extension) and size before upload. */
export function validateXRayFile(file: File): ImageValidationResult {
  const ext = fileExtension(file.name);
  const mime = file.type.toLowerCase();
  const isDicom = ext === ".dcm" || ext === ".dicom";
  const mimeOk =
    mime === "" ||
    ACCEPTED_MIME_TYPES.has(mime) ||
    (isDicom && (mime === "" || mime === "application/octet-stream"));
  const extOk = ext !== "" && ACCEPTED_EXTENSIONS.has(ext);

  if (!extOk) {
    return {
      valid: false,
      message:
        "Invalid file type. Please upload a chest X-ray as PNG, JPEG, or DICOM (.png, .jpg, .jpeg, .dcm).",
    };
  }

  if (!mimeOk && !isDicom) {
    return {
      valid: false,
      message:
        "Invalid file type. Please upload a chest X-ray as PNG, JPEG, or DICOM (.png, .jpg, .jpeg, .dcm).",
    };
  }

  const maxBytes = MAX_XRAY_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      message: `File is too large. Maximum size is ${MAX_XRAY_SIZE_MB} MB.`,
    };
  }

  if (file.size === 0) {
    return { valid: false, message: "The selected file is empty." };
  }

  return { valid: true };
}
