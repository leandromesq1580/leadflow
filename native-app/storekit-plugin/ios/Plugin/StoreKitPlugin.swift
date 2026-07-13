import Foundation
import Capacitor
import StoreKit

// Assinatura CRM Pro via StoreKit 2 (App Store 3.1.1). Um único produto.
@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin {
    let productId = "crm_pro_monthly_99"

    @objc func getProduct(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("ios15_required"); return }
        Task {
            do {
                let products = try await Product.products(for: [self.productId])
                guard let p = products.first else { call.reject("product_not_found"); return }
                call.resolve(["id": p.id, "displayPrice": p.displayPrice, "displayName": p.displayName])
            } catch { call.reject("store_error: \(error.localizedDescription)") }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("ios15_required"); return }
        Task { @MainActor in
            do {
                let products = try await Product.products(for: [self.productId])
                guard let p = products.first else { call.reject("product_not_found"); return }
                let result = try await p.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let tx):
                        await tx.finish()
                        call.resolve(["status": "success", "jws": verification.jwsRepresentation,
                                      "productId": tx.productID,
                                      "expires": tx.expirationDate.map { $0.timeIntervalSince1970 * 1000 } ?? 0])
                    case .unverified:
                        call.reject("unverified_transaction")
                    }
                case .userCancelled: call.resolve(["status": "cancelled"])
                case .pending: call.resolve(["status": "pending"])
                @unknown default: call.resolve(["status": "unknown"])
                }
            } catch { call.reject("purchase_error: \(error.localizedDescription)") }
        }
    }

    @objc func entitlement(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("ios15_required"); return }
        Task {
            var active = false; var jws = ""; var expires: Double = 0
            for await result in Transaction.currentEntitlements {
                if case .verified(let tx) = result, tx.productID == self.productId {
                    if let e = tx.expirationDate, e > Date() {
                        active = true; jws = result.jwsRepresentation; expires = e.timeIntervalSince1970 * 1000
                    }
                }
            }
            call.resolve(["active": active, "jws": jws, "expires": expires])
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("ios15_required"); return }
        Task {
            try? await AppStore.sync()
            call.resolve(["done": true])
        }
    }
}
