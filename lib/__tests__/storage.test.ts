import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

// A controllable mock of the Supabase Storage `from(bucket)` client.
const { storageBucketMock, createClientMock } = vi.hoisted(() => {
  const storageBucketMock = {
    upload: vi.fn(),
    remove: vi.fn(),
    createSignedUrl: vi.fn(),
  };
  return {
    storageBucketMock,
    createClientMock: vi.fn(async () => ({
      storage: { from: vi.fn(() => storageBucketMock) },
    })),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

import {
  PRINT_PHOTOS_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  buildPhotoKey,
  createSignedUrl,
  removePhoto,
  replacePhoto,
  uploadPhoto,
} from "@/lib/storage";

function fakeFile(name: string, type: string): File {
  return { name, type, size: 10 } as unknown as File;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildPhotoKey — unguessable, namespaced, extension-preserving", () => {
  it("produces a prints/<uuid>.<ext> key", () => {
    const key = buildPhotoKey("photo.PNG");
    expect(key).toMatch(/^prints\/[0-9a-f-]{36}\.png$/);
  });

  it("yields a different key each call (unguessable)", () => {
    expect(buildPhotoKey("a.png")).not.toBe(buildPhotoKey("a.png"));
  });

  it("drops a missing or unsafe extension", () => {
    expect(buildPhotoKey()).toMatch(/^prints\/[0-9a-f-]{36}$/);
    expect(buildPhotoKey("weird.name.")).toMatch(/^prints\/[0-9a-f-]{36}$/);
  });
});

describe("uploadPhoto (R5) — returns the object key, never a public URL", () => {
  it("uploads to the print-photos bucket and returns a generated key", async () => {
    storageBucketMock.upload.mockResolvedValue({ error: null });
    const key = await uploadPhoto(fakeFile("x.png", "image/png"));

    expect(key).toMatch(/^prints\//);
    const [uploadKey, file, opts] = storageBucketMock.upload.mock.calls[0];
    expect(uploadKey).toBe(key);
    expect(file).toBeTruthy();
    expect(opts).toMatchObject({ contentType: "image/png", upsert: false });
    // The returned value is an opaque key, not an http(s) URL.
    expect(key).not.toMatch(/^https?:/);
  });

  it("throws when the upload errors (so the action aborts before the DB write)", async () => {
    storageBucketMock.upload.mockResolvedValue({ error: { message: "boom" } });
    await expect(uploadPhoto(fakeFile("x.png", "image/png"))).rejects.toThrow(
      /upload failed/i,
    );
  });
});

describe("createSignedUrl (R4) — TTL 3600, null-safe", () => {
  it("returns null without calling Supabase when key is null", async () => {
    const result = await createSignedUrl(null);
    expect(result).toBeNull();
    expect(storageBucketMock.createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs with the 1-hour TTL and returns the signed url", async () => {
    storageBucketMock.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/x" },
      error: null,
    });
    const url = await createSignedUrl("prints/abc.png");
    expect(url).toBe("https://signed.example/x");
    expect(storageBucketMock.createSignedUrl).toHaveBeenCalledWith(
      "prints/abc.png",
      SIGNED_URL_TTL_SECONDS,
    );
    expect(SIGNED_URL_TTL_SECONDS).toBe(3600);
  });

  it("returns null (no crash) when signing fails", async () => {
    storageBucketMock.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "nope" },
    });
    expect(await createSignedUrl("prints/abc.png")).toBeNull();
  });
});

describe("removePhoto (R7)", () => {
  it("removes the key from the bucket", async () => {
    storageBucketMock.remove.mockResolvedValue({ error: null });
    await removePhoto("prints/abc.png");
    expect(storageBucketMock.remove).toHaveBeenCalledWith(["prints/abc.png"]);
  });

  it("throws when removal errors", async () => {
    storageBucketMock.remove.mockResolvedValue({ error: { message: "x" } });
    await expect(removePhoto("prints/abc.png")).rejects.toThrow(
      /removal failed/i,
    );
  });
});

describe("replacePhoto (R6) — upload new, then remove old", () => {
  it("uploads the new file and removes the previous key", async () => {
    storageBucketMock.upload.mockResolvedValue({ error: null });
    storageBucketMock.remove.mockResolvedValue({ error: null });

    const newKey = await replacePhoto(
      fakeFile("new.png", "image/png"),
      "prints/old.png",
    );

    expect(newKey).toMatch(/^prints\//);
    expect(storageBucketMock.upload).toHaveBeenCalledTimes(1);
    expect(storageBucketMock.remove).toHaveBeenCalledWith(["prints/old.png"]);
  });

  it("skips removal when there is no previous key", async () => {
    storageBucketMock.upload.mockResolvedValue({ error: null });
    await replacePhoto(fakeFile("new.png", "image/png"), null);
    expect(storageBucketMock.remove).not.toHaveBeenCalled();
  });

  it("uses the configured bucket name", () => {
    expect(PRINT_PHOTOS_BUCKET).toBe("print-photos");
  });
});
