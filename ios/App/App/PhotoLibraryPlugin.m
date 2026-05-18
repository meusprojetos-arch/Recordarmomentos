#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PhotoLibraryPlugin, "PhotoLibraryPlugin",
    CAP_PLUGIN_METHOD(checkPhotoPermissions, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestPhotoPermissions, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getMediaCount, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getMediaPage, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getAssetData, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(cleanupTempFile, CAPPluginReturnPromise);
)
