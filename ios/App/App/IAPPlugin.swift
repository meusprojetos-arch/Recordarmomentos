import Foundation
import StoreKit
import Capacitor

@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin, CAPBridgedPlugin, SKProductsRequestDelegate, SKPaymentTransactionObserver {

    // Capacitor 6+: protocolo CAPBridgedPlugin substitui o macro CAP_PLUGIN do .m
    public let identifier = "IAPPlugin"
    public let jsName = "IAPPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canMakePayments",  returnType: CAPPluginReturnPromise),
    ]

    private var productsRequest: SKProductsRequest?
    private var pendingCall: CAPPluginCall?
    private var products: [String: SKProduct] = [:]

    public override func load() {
        SKPaymentQueue.default().add(self)
    }

    deinit {
        SKPaymentQueue.default().remove(self)
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds required")
            return
        }
        pendingCall = call
        let request = SKProductsRequest(productIdentifiers: Set(ids))
        request.delegate = self
        productsRequest = request
        request.start()
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId required")
            return
        }
        guard SKPaymentQueue.canMakePayments() else {
            call.reject("Payments not allowed on this device")
            return
        }
        guard let product = products[productId] else {
            call.reject("Product not found. Call getProducts first.")
            return
        }
        pendingCall = call
        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        pendingCall = call
        SKPaymentQueue.default().restoreCompletedTransactions()
    }

    @objc func canMakePayments(_ call: CAPPluginCall) {
        call.resolve(["value": SKPaymentQueue.canMakePayments()])
    }

    // MARK: - SKProductsRequestDelegate
    public func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        var result: [[String: Any]] = []
        for product in response.products {
            products[product.productIdentifier] = product
            let formatter = NumberFormatter()
            formatter.numberStyle = .currency
            formatter.locale = product.priceLocale
            let priceStr = formatter.string(from: product.price) ?? "\(product.price)"
            result.append([
                "productId": product.productIdentifier,
                "title": product.localizedTitle,
                "description": product.localizedDescription,
                "price": product.price.doubleValue,
                "priceString": priceStr,
                "currency": product.priceLocale.currencyCode ?? ""
            ])
        }
        pendingCall?.resolve(["products": result, "invalidIds": response.invalidProductIdentifiers])
        pendingCall = nil
    }

    public func request(_ request: SKRequest, didFailWithError error: Error) {
        pendingCall?.reject(error.localizedDescription)
        pendingCall = nil
    }

    // MARK: - SKPaymentTransactionObserver
    public func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        for transaction in transactions {
            switch transaction.transactionState {
            case .purchased:
                let receiptData = Bundle.main.appStoreReceiptURL.flatMap { try? Data(contentsOf: $0) }
                let receiptStr = receiptData?.base64EncodedString() ?? ""
                pendingCall?.resolve([
                    "productId": transaction.payment.productIdentifier,
                    "transactionId": transaction.transactionIdentifier ?? "",
                    "receipt": receiptStr,
                    "status": "purchased"
                ])
                pendingCall = nil
                SKPaymentQueue.default().finishTransaction(transaction)

            case .failed:
                let errMsg = transaction.error?.localizedDescription ?? "Purchase failed"
                if (transaction.error as? SKError)?.code == .paymentCancelled {
                    pendingCall?.reject("cancelled")
                } else {
                    pendingCall?.reject(errMsg)
                }
                pendingCall = nil
                SKPaymentQueue.default().finishTransaction(transaction)

            case .restored:
                notifyListeners("purchaseRestored", data: [
                    "productId": transaction.payment.productIdentifier,
                    "transactionId": transaction.transactionIdentifier ?? ""
                ])
                SKPaymentQueue.default().finishTransaction(transaction)

            case .deferred, .purchasing:
                break

            @unknown default:
                break
            }
        }
    }

    public func paymentQueueRestoreCompletedTransactionsFinished(_ queue: SKPaymentQueue) {
        pendingCall?.resolve(["status": "restored"])
        pendingCall = nil
    }

    public func paymentQueue(_ queue: SKPaymentQueue, restoreCompletedTransactionsFailedWithError error: Error) {
        pendingCall?.reject(error.localizedDescription)
        pendingCall = nil
    }
}
