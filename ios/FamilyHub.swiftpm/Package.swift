// swift-tools-version: 5.9

// Swift Playgrounds App project (.swiftpm).
// Open this folder in Swift Playgrounds (iPad/Mac) or Xcode to build & run.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "FamilyHub",
    platforms: [
        .iOS("16.0")
    ],
    products: [
        .iOSApplication(
            name: "FamilyHub",
            targets: ["AppModule"],
            bundleIdentifier: "com.familyhub.manager",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .house),
            accentColor: .presetColor(.blue),
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "."
        )
    ]
)
