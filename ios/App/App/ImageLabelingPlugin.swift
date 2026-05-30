import Foundation
import Vision
import Capacitor

/**
 * ImageLabelingPlugin — classifica imagens usando Vision framework (on-device).
 *
 * Usa VNClassifyImageRequest disponível desde iOS 13.
 * Nenhuma dependência externa ou pod necessário.
 *
 * Método exposto ao JS:
 *   classifyImage({ base64: string, mimeType: string })
 *   → { labels: string[] }
 *
 * Só retorna identificadores com confidence >= confidenceThreshold (70%).
 */
@objc(ImageLabelingPlugin)
public class ImageLabelingPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier  = "ImageLabelingPlugin"
    public let jsName      = "ImageLabeling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "classifyImage", returnType: CAPPluginReturnPromise),
    ]

    private let confidenceThreshold: VNConfidence = 0.70

    @objc func classifyImage(_ call: CAPPluginCall) {
        guard
            let base64 = call.getString("base64"),
            let imageData = Data(base64Encoded: base64),
            let ciImage = CIImage(data: imageData)
        else {
            call.reject("Invalid image data")
            return
        }

        let request = VNClassifyImageRequest { [weak self] req, error in
            guard let self = self else { return }

            if let error = error {
                call.reject("Vision error: \(error.localizedDescription)")
                return
            }

            guard let observations = req.results as? [VNClassificationObservation] else {
                call.resolve(["labels": []])
                return
            }

            // Filtra pelo threshold e extrai os identificadores
            let labels: [String] = observations
                .filter { $0.confidence >= self.confidenceThreshold }
                .map { $0.identifier }

            call.resolve(["labels": labels])
        }

        // Roda em thread de background para não bloquear a UI
        DispatchQueue.global(qos: .userInitiated).async {
            let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                call.reject("Handler error: \(error.localizedDescription)")
            }
        }
    }
}
