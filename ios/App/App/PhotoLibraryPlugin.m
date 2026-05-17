#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PhotoLibraryPlugin, "PhotoLibraryPlugin",
    CAP_PLUGIN_METHOD(checkPermissions, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getMediaCount, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getMediaPage, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getAssetData, CAPPluginReturnPromise);
)
