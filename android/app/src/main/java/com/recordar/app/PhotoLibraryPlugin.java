package com.recordar.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;

/**
 * PhotoLibraryPlugin — Acesso completo à galeria de fotos/vídeos no Android.
 *
 * Métodos:
 *  - checkPhotoPermissions(): { status }
 *  - requestPhotoPermissions(): { status }
 *  - getMediaCount(): { photos, videos, total }
 *  - getMediaPage({ offset, limit }): { assets, hasMore, total }
 *  - getAssetData({ id }): { data: base64, mimeType, size }
 */
@CapacitorPlugin(
    name = "PhotoLibraryPlugin",
    permissions = {
        @Permission(
            alias = "gallery",
            strings = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO
            }
        ),
        @Permission(
            alias = "galleryLegacy",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
        )
    }
)
public class PhotoLibraryPlugin extends Plugin {

    private static final String TAG = "PhotoLibraryPlugin";

    // ─── Permissões ─────────────────────────────────────────────────────────

    @PluginMethod
    public void checkPhotoPermissions(PluginCall call) {
        String status = getPermissionStatus();
        JSObject result = new JSObject();
        result.put("status", status);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPhotoPermissions(PluginCall call) {
        String status = getPermissionStatus();
        if ("authorized".equals(status)) {
            JSObject result = new JSObject();
            result.put("status", "authorized");
            call.resolve(result);
            return;
        }

        // Solicitar permissão apropriada para a versão do Android
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("gallery", call, "handlePermissionResult");
        } else {
            requestPermissionForAlias("galleryLegacy", call, "handlePermissionResult");
        }
    }

    @PermissionCallback
    private void handlePermissionResult(PluginCall call) {
        String status = getPermissionStatus();
        JSObject result = new JSObject();
        result.put("status", status);
        call.resolve(result);
    }

    private String getPermissionStatus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean images = getPermissionState("gallery") == com.getcapacitor.PermissionState.GRANTED;
            if (images) return "authorized";
            boolean denied = getPermissionState("gallery") == com.getcapacitor.PermissionState.DENIED;
            if (denied) return "denied";
            return "not_determined";
        } else {
            boolean storage = getPermissionState("galleryLegacy") == com.getcapacitor.PermissionState.GRANTED;
            if (storage) return "authorized";
            boolean denied = getPermissionState("galleryLegacy") == com.getcapacitor.PermissionState.DENIED;
            if (denied) return "denied";
            return "not_determined";
        }
    }

    // ─── Contagem de mídia ──────────────────────────────────────────────────

    @PluginMethod
    public void getMediaCount(PluginCall call) {
        ContentResolver resolver = getContext().getContentResolver();

        int photos = countMedia(resolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
        int videos = countMedia(resolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI);

        JSObject result = new JSObject();
        result.put("photos", photos);
        result.put("videos", videos);
        result.put("total", photos + videos);
        call.resolve(result);
    }

    private int countMedia(ContentResolver resolver, Uri uri) {
        Cursor cursor = resolver.query(uri, new String[]{"COUNT(*)"}, null, null, null);
        if (cursor == null) return 0;
        try {
            if (cursor.moveToFirst()) return cursor.getInt(0);
            return 0;
        } finally {
            cursor.close();
        }
    }

    // ─── Paginação de mídia ─────────────────────────────────────────────────

    @PluginMethod
    public void getMediaPage(PluginCall call) {
        int offset = call.getInt("offset", 0);
        int limit = call.getInt("limit", 50);

        ContentResolver resolver = getContext().getContentResolver();
        JSArray assets = new JSArray();

        // Consultar imagens
        int totalPhotos = countMedia(resolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
        int totalVideos = countMedia(resolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI);
        int total = totalPhotos + totalVideos;

        // Combina fotos e vídeos, ordenados por data de criação (mais recente primeiro)
        // Usamos duas queries separadas e merge manual por data

        // Buscar fotos com paginação
        String[] imageProjection = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.SIZE
        };

        String[] videoProjection = {
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DATE_ADDED,
            MediaStore.Video.Media.WIDTH,
            MediaStore.Video.Media.HEIGHT,
            MediaStore.Video.Media.MIME_TYPE,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DURATION
        };

        // Usamos uma abordagem de query unificada via MediaStore.Files
        Uri filesUri = MediaStore.Files.getContentUri("external");
        String[] filesProjection = {
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.WIDTH,
            MediaStore.Files.FileColumns.HEIGHT,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.MEDIA_TYPE,
            MediaStore.Files.FileColumns.DURATION
        };

        String selection = MediaStore.Files.FileColumns.MEDIA_TYPE + "=? OR " +
                           MediaStore.Files.FileColumns.MEDIA_TYPE + "=?";
        String[] selectionArgs = {
            String.valueOf(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE),
            String.valueOf(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO)
        };

        String sortOrder = MediaStore.Files.FileColumns.DATE_ADDED + " DESC LIMIT " + limit + " OFFSET " + offset;

        Cursor cursor = resolver.query(filesUri, filesProjection, selection, selectionArgs, sortOrder);
        if (cursor != null) {
            try {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
                int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME);
                int dateCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED);
                int widthCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.WIDTH);
                int heightCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.HEIGHT);
                int mimeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE);
                int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE);
                int typeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE);
                int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DURATION);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idCol);
                    String filename = cursor.getString(nameCol);
                    long dateAdded = cursor.getLong(dateCol);
                    int width = cursor.getInt(widthCol);
                    int height = cursor.getInt(heightCol);
                    String mimeType = cursor.getString(mimeCol);
                    long size = cursor.getLong(sizeCol);
                    int mediaType = cursor.getInt(typeCol);
                    long duration = cursor.getLong(durationCol);

                    boolean isVideo = mediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;

                    JSObject asset = new JSObject();
                    asset.put("id", String.valueOf(id));
                    asset.put("type", isVideo ? "video" : "photo");
                    asset.put("filename", filename != null ? filename : "media_" + id);
                    asset.put("createdAt", dateAdded * 1000L); // seconds -> milliseconds
                    asset.put("width", width);
                    asset.put("height", height);
                    asset.put("mimeType", mimeType);
                    asset.put("size", size);
                    asset.put("duration", isVideo ? (duration / 1000.0) : 0);

                    assets.put(asset);
                }
            } finally {
                cursor.close();
            }
        }

        int endIdx = offset + limit;
        JSObject result = new JSObject();
        result.put("assets", assets);
        result.put("total", total);
        result.put("hasMore", endIdx < total);
        call.resolve(result);
    }

    // ─── Dados do asset (base64) ────────────────────────────────────────────

    @PluginMethod
    public void getAssetData(PluginCall call) {
        String idStr = call.getString("id");
        if (idStr == null || idStr.isEmpty()) {
            call.reject("id required");
            return;
        }

        long id;
        try {
            id = Long.parseLong(idStr);
        } catch (NumberFormatException e) {
            call.reject("invalid id format");
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();

        // Detectar se é imagem ou vídeo
        String mimeType = null;
        Uri contentUri = null;

        // Tentar como imagem primeiro
        Uri imageUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        mimeType = getMimeType(resolver, imageUri);

        if (mimeType != null && mimeType.startsWith("image/")) {
            contentUri = imageUri;
        } else {
            // Tentar como vídeo
            Uri videoUri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id);
            mimeType = getMimeType(resolver, videoUri);
            if (mimeType != null && mimeType.startsWith("video/")) {
                contentUri = videoUri;
            } else {
                // Fallback: usar Files URI genérica
                contentUri = ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), id);
                mimeType = getMimeType(resolver, contentUri);
                if (mimeType == null) {
                    call.reject("asset not found: " + idStr);
                    return;
                }
            }
        }

        try {
            InputStream inputStream = resolver.openInputStream(contentUri);
            if (inputStream == null) {
                call.reject("failed to open asset stream");
                return;
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int len;
            while ((len = inputStream.read(buffer)) != -1) {
                baos.write(buffer, 0, len);
            }
            inputStream.close();

            byte[] data = baos.toByteArray();
            String base64 = Base64.encodeToString(data, Base64.NO_WRAP);

            JSObject result = new JSObject();
            result.put("data", base64);
            result.put("mimeType", mimeType);
            result.put("size", data.length);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("failed to read asset: " + e.getMessage());
        }
    }

    private String getMimeType(ContentResolver resolver, Uri uri) {
        try {
            Cursor cursor = resolver.query(uri, new String[]{MediaStore.Files.FileColumns.MIME_TYPE}, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        return cursor.getString(0);
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }
}
