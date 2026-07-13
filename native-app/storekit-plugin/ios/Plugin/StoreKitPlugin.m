#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(StoreKitPlugin, "StoreKitPlugin",
  CAP_PLUGIN_METHOD(getProduct, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(entitlement, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(restore, CAPPluginReturnPromise);
)
