import UIKit
import Capacitor

/**
 * ViewController customizado para registrar plugins nativos explicitamente.
 *
 * Em Capacitor 6, o mecanismo de auto-discovery via CAP_PLUGIN macro pode
 * falhar dependendo de como o linker/runtime carrega as categorias Obj-C.
 * Registrar aqui garante 100% que os plugins estarão disponíveis no bridge.
 */
class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(IAPPlugin())
        bridge?.registerPluginInstance(PhotoLibraryPlugin())
    }
}
