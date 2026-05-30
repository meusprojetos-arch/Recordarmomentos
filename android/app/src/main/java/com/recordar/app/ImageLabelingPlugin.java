package com.recordar.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.label.ImageLabel;
import com.google.mlkit.vision.label.ImageLabeler;
import com.google.mlkit.vision.label.ImageLabeling;
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions;

/**
 * ImageLabelingPlugin — classifica imagens usando ML Kit on-device.
 *
 * Método exposto ao JS:
 *   classifyImage({ base64: string, mimeType: string })
 *   → { labels: string[] }
 *
 * Só retorna labels com confiança >= CONFIDENCE_THRESHOLD (70%).
 */
@CapacitorPlugin(name = "ImageLabeling")
public class ImageLabelingPlugin extends Plugin {

    private static final float CONFIDENCE_THRESHOLD = 0.70f;

    @PluginMethod
    public void classifyImage(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isEmpty()) {
            call.reject("base64 is required");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("Could not decode image");
                return;
            }

            InputImage image = InputImage.fromBitmap(bitmap, 0);

            ImageLabelerOptions options = new ImageLabelerOptions.Builder()
                    .setConfidenceThreshold(CONFIDENCE_THRESHOLD)
                    .build();

            ImageLabeler labeler = ImageLabeling.getClient(options);

            labeler.process(image)
                .addOnSuccessListener(labels -> {
                    JSArray arr = new JSArray();
                    for (ImageLabel label : labels) {
                        arr.put(label.getText());
                    }
                    JSObject result = new JSObject();
                    result.put("labels", arr);
                    call.resolve(result);
                })
                .addOnFailureListener(e -> call.reject("ML Kit error: " + e.getMessage()));

        } catch (Exception e) {
            call.reject("ImageLabelingPlugin error: " + e.getMessage());
        }
    }
}
