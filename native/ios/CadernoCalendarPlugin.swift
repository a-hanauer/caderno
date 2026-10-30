// Lê a agenda do iPhone (EventKit) para o Caderno. Só leitura.
// JS: Capacitor.registerPlugin('CadernoCalendar') → status(), requestAccess(), listCalendars(), events({from, to, calendars})
// e o evento "changed" quando a agenda do iPhone muda.
import Foundation
import Capacitor
import EventKit
import UIKit

@objc(CadernoCalendarPlugin)
public class CadernoCalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CadernoCalendarPlugin"
    public let jsName = "CadernoCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listCalendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "events", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    private var store = EKEventStore()

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(storeChanged), name: .EKEventStoreChanged, object: nil)
    }

    @objc private func storeChanged() {
        notifyListeners("changed", data: [:])
    }

    private func statusString() -> String {
        let s = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            if s == .fullAccess { return "granted" }
            if s == .writeOnly { return "denied" }
        }
        switch s {
        case .authorized: return "granted"
        case .notDetermined: return "prompt"
        case .restricted: return "restricted"
        default: return "denied"
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["status": statusString()])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        let done: (Bool, Error?) -> Void = { _, _ in
            DispatchQueue.main.async {
                self.store = EKEventStore() // recria para enxergar as agendas depois da permissão
                call.resolve(["status": self.statusString()])
            }
        }
        if #available(iOS 17.0, *) {
            store.requestFullAccessToEvents(completion: done)
        } else {
            store.requestAccess(to: .event, completion: done)
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    @objc func listCalendars(_ call: CAPPluginCall) {
        guard statusString() == "granted" else { call.resolve(["calendars": []]); return }
        let list = store.calendars(for: .event).map { c -> [String: Any] in
            [
                "id": c.calendarIdentifier,
                "title": c.title,
                "source": c.source?.title ?? "",
                "color": Self.hex(c.cgColor),
            ]
        }
        call.resolve(["calendars": list])
    }

    @objc func events(_ call: CAPPluginCall) {
        guard statusString() == "granted" else { call.reject("sem-permissao"); return }
        guard let fromS = call.getString("from"), let toS = call.getString("to"),
              let from = Self.day.date(from: fromS), let to = Self.day.date(from: toS) else {
            call.reject("datas"); return
        }
        let ids = call.getArray("calendars", String.self) ?? []
        let cals = store.calendars(for: .event).filter { ids.contains($0.calendarIdentifier) }
        if cals.isEmpty { call.resolve(["events": []]); return }

        // o EventKit limita cada busca a 4 anos; o Caderno pede ~440 dias
        let pred = store.predicateForEvents(withStart: from, end: to, calendars: cals)
        let cal = Calendar.current
        let out = store.events(matching: pred).map { e -> [String: Any] in
            let title = e.title ?? ""
            let id = (e.calendarItemIdentifier) + "@" + Self.minute.string(from: e.startDate)
            if e.isAllDay {
                // no EventKit o fim de um evento de dia inteiro é o fim do último dia; o Caderno usa o dia seguinte (exclusivo)
                let lastDay = cal.startOfDay(for: e.endDate.addingTimeInterval(-1))
                let endEx = cal.date(byAdding: .day, value: 1, to: lastDay) ?? e.endDate
                return ["id": id, "title": title, "allDay": true,
                        "start": Self.day.string(from: e.startDate), "end": Self.day.string(from: endEx),
                        "cal": e.calendar.title]
            }
            return ["id": id, "title": title, "allDay": false,
                    "start": Self.minute.string(from: e.startDate), "end": Self.minute.string(from: e.endDate),
                    "cal": e.calendar.title]
        }
        call.resolve(["events": out])
    }

    // ---- formatos de data no fuso do aparelho ----
    private static func fmt(_ f: String) -> DateFormatter {
        let d = DateFormatter()
        d.calendar = Calendar(identifier: .gregorian)
        d.locale = Locale(identifier: "en_US_POSIX")
        d.timeZone = .current
        d.dateFormat = f
        return d
    }
    private static let day = fmt("yyyy-MM-dd")
    private static let minute = fmt("yyyy-MM-dd'T'HH:mm")

    private static func hex(_ color: CGColor?) -> String {
        guard let c = color?.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil),
              let comp = c.components, comp.count >= 3 else { return "#6b7b93" }
        return String(format: "#%02x%02x%02x", Int(comp[0] * 255), Int(comp[1] * 255), Int(comp[2] * 255))
    }
}
