import Foundation
import Photos
import AVFoundation
import Capacitor

/**
 * PhotoLibraryPlugin — acesso completo à galeria de fotos/vídeos do iPhone.
 *
 * Métodos:
 *  - checkPermissions(): { status: "authorized" | "limited" | "denied" | "restricted" | "not_determined" }
 *  - requestPermissions(): dispara o modal padrão do iOS, retorna { status }
 *  - getMediaCount(): { photos, videos, total }
 *  - getMediaPage({ offset, limit }): { assets: [{id, type, filename, createdAt, width, height}], hasMore, total }
 *  - getAssetData({ id }): { data: base64, mimeType, size }
 */
@objc(PhotoLibraryPlugin)
public class PhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {

    // Capacitor 6+: protocolo CAPBridgedPlugin substitui o macro CAP_PLUGIN do .m
    public let identifier = "PhotoLibraryPlugin"
    public let jsName = "PhotoLibraryPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPhotoPermissions",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPhotoPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMediaCount",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMediaPage",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAssetData",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cleanupTempFile",         returnType: CAPPluginReturnPromise),
    ]

    @objc func checkPhotoPermissions(_ call: CAPPluginCall) {
        let status: PHAuthorizationStatus
        if #available(iOS 14, *) {
            status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        } else {
            status = PHPhotoLibrary.authorizationStatus()
        }
        call.resolve(["status": statusString(status)])
    }

    @objc func requestPhotoPermissions(_ call: CAPPluginCall) {
        if #available(iOS 14, *) {
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                call.resolve(["status": self.statusString(status)])
            }
        } else {
            PHPhotoLibrary.requestAuthorization { status in
                call.resolve(["status": self.statusString(status)])
            }
        }
    }

    @objc func getMediaCount(_ call: CAPPluginCall) {
        let photoOpt = PHFetchOptions()
        photoOpt.predicate = NSPredicate(format: "mediaType = %d", PHAssetMediaType.image.rawValue)
        let photos = PHAsset.fetchAssets(with: photoOpt).count

        let videoOpt = PHFetchOptions()
        videoOpt.predicate = NSPredicate(format: "mediaType = %d", PHAssetMediaType.video.rawValue)
        let videos = PHAsset.fetchAssets(with: videoOpt).count

        call.resolve(["photos": photos, "videos": videos, "total": photos + videos])
    }

    @objc func getMediaPage(_ call: CAPPluginCall) {
        let offset = call.getInt("offset") ?? 0
        let limit = call.getInt("limit") ?? 50

        let opt = PHFetchOptions()
        opt.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opt.predicate = NSPredicate(format: "mediaType = %d OR mediaType = %d",
                                    PHAssetMediaType.image.rawValue,
                                    PHAssetMediaType.video.rawValue)
        let fetchResult = PHAsset.fetchAssets(with: opt)

        let total = fetchResult.count
        let endIdx = min(offset + limit, total)
        var assets: [[String: Any]] = []

        if offset < total {
            for i in offset..<endIdx {
                let asset = fetchResult.object(at: i)
                let resources = PHAssetResource.assetResources(for: asset)
                let filename = resources.first?.originalFilename ?? "asset_\(i).bin"
                let createdAtMs = (asset.creationDate?.timeIntervalSince1970 ?? 0) * 1000.0

                assets.append([
                    "id": asset.localIdentifier,
                    "type": asset.mediaType == .image ? "photo" : "video",
                    "filename": filename,
                    "createdAt": createdAtMs,
                    "width": asset.pixelWidth,
                    "height": asset.pixelHeight,
                    "duration": asset.duration
                ])
            }
        }

        call.resolve([
            "assets": assets,
            "total": total,
            "hasMore": endIdx < total
        ])
    }

    @objc func getAssetData(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("id required")
            return
        }

        let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil)
        guard let asset = fetchResult.firstObject else {
            call.reject("asset not found")
            return
        }

        if asset.mediaType == .image {
            let options = PHImageRequestOptions()
            options.version = .current
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = true
            options.isSynchronous = false

            if #available(iOS 13, *) {
                PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, uti, _, info in
                    self.handleImageData(call: call, data: data, uti: uti, info: info)
                }
            } else {
                PHImageManager.default().requestImageData(for: asset, options: options) { data, uti, _, info in
                    self.handleImageData(call: call, data: data, uti: uti, info: info)
                }
            }
        } else if asset.mediaType == .video {
            let options = PHVideoRequestOptions()
            options.version = .current
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = true

            PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
                guard let urlAsset = avAsset as? AVURLAsset else {
                    call.reject("failed to get video URL")
                    return
                }
                // Pra vídeos: COPIA pro temp dir (não passa nada pela memória JS)
                let ext = urlAsset.url.pathExtension.lowercased()
                let mimeType = self.videoMime(forExt: ext)
                let tempURL = self.makeTempFileURL(ext: ext.isEmpty ? "mp4" : ext)
                do {
                    // Tenta hard-link primeiro (zero cópia em RAM), fallback pra copy
                    try? FileManager.default.removeItem(at: tempURL)
                    do {
                        try FileManager.default.linkItem(at: urlAsset.url, to: tempURL)
                    } catch {
                        try FileManager.default.copyItem(at: urlAsset.url, to: tempURL)
                    }
                    let attrs = try FileManager.default.attributesOfItem(atPath: tempURL.path)
                    let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
                    call.resolve([
                        "uri": tempURL.absoluteString,    // file:///...
                        "path": tempURL.path,
                        "mimeType": mimeType,
                        "size": size
                    ])
                } catch {
                    call.reject("failed to prepare video temp: \(error.localizedDescription)")
                }
            }
        } else {
            call.reject("unsupported media type")
        }
    }

    private func handleImageData(call: CAPPluginCall, data: Data?, uti: String?, info: [AnyHashable: Any]?) {
        guard let data = data else {
            let err = (info?[PHImageErrorKey] as? NSError)?.localizedDescription ?? "no data"
            call.reject("failed to load image: \(err)")
            return
        }
        let mimeType = mimeTypeFromUTI(uti) ?? "image/jpeg"
        let ext = extFromMime(mimeType)

        // Escreve em arquivo temporário em vez de retornar base64.
        // Economiza ~3x memória JS (string base64 ocupa 2x do binário).
        let tempURL = makeTempFileURL(ext: ext)
        do {
            try data.write(to: tempURL, options: .atomic)
            call.resolve([
                "uri": tempURL.absoluteString,    // file:///private/var/...
                "path": tempURL.path,
                "mimeType": mimeType,
                "size": data.count
            ])
        } catch {
            call.reject("failed to write temp file: \(error.localizedDescription)")
        }
    }

    /// Cria URL pra arquivo temporário único (UUID) no /tmp do app.
    private func makeTempFileURL(ext: String) -> URL {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("recordar_import", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        return tempDir.appendingPathComponent("\(UUID().uuidString).\(ext)")
    }

    /// Apaga arquivo temporário (chamado pelo JS após upload bem-sucedido).
    @objc func cleanupTempFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.resolve()
            return
        }
        // Só apaga se for de fato do nosso diretório temp (segurança)
        let safeRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("recordar_import").path
        if path.hasPrefix(safeRoot) {
            try? FileManager.default.removeItem(atPath: path)
        }
        call.resolve()
    }

    private func extFromMime(_ mime: String) -> String {
        let m = mime.lowercased()
        if m.contains("png")  { return "png" }
        if m.contains("heic") { return "heic" }
        if m.contains("heif") { return "heif" }
        if m.contains("gif")  { return "gif" }
        if m.contains("webp") { return "webp" }
        return "jpg"
    }

    private func statusString(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "not_determined"
        case .restricted:    return "restricted"
        case .denied:        return "denied"
        case .authorized:    return "authorized"
        case .limited:       return "limited"
        @unknown default:    return "unknown"
        }
    }

    private func mimeTypeFromUTI(_ uti: String?) -> String? {
        guard let uti = uti?.lowercased() else { return nil }
        if uti.contains("jpeg") || uti.contains("jpg") { return "image/jpeg" }
        if uti.contains("png")  { return "image/png" }
        if uti.contains("heic") { return "image/heic" }
        if uti.contains("heif") { return "image/heif" }
        if uti.contains("gif")  { return "image/gif" }
        if uti.contains("webp") { return "image/webp" }
        return "image/jpeg"
    }

    private func videoMime(forExt ext: String) -> String {
        switch ext {
        case "mp4":  return "video/mp4"
        case "mov":  return "video/quicktime"
        case "m4v":  return "video/x-m4v"
        case "3gp":  return "video/3gpp"
        default:     return "video/mp4"
        }
    }
}
