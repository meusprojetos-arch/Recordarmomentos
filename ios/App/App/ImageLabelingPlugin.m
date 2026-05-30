#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(ImageLabelingPlugin, "ImageLabeling",
    CAP_PLUGIN_METHOD(classifyImage, CAPPluginReturnPromise);
)
