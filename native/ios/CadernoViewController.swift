// Registra os plugins próprios do Caderno no Capacitor.
import UIKit
import Capacitor

class CadernoViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CadernoCalendarPlugin())
    }
}
