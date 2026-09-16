import 'package:flutter/foundation.dart';

enum ServerUrlProblem { invalid, insecure }

/// With `adb reverse` the phone reaches the developer machine through its own loopback, so plain http to these hosts
/// never leaves the device.
const Set<String> _loopbackHosts = {'localhost', '127.0.0.1'};

/// Why [text] cannot be used as the server address, or null when it can.
///
/// Release builds talk to remote hosts over https only: the session token and the menus travel over this connection,
/// and dart:io does not apply Android's `usesCleartextTraffic` flag, so the app has to enforce it itself.
ServerUrlProblem? checkServerUrl(String text, {bool release = kReleaseMode}) {
  final uri = Uri.tryParse(text.trim());
  if (uri == null || !(uri.isScheme('http') || uri.isScheme('https')) || uri.host.isEmpty) return ServerUrlProblem.invalid;
  if (release && uri.isScheme('http') && !_loopbackHosts.contains(uri.host)) return ServerUrlProblem.insecure;
  return null;
}
