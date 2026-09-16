import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/utils/server_url.dart';
import '../../core/widgets/brand_mark.dart';
import '../../core/widgets/common.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _server = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  /// The server address is prefilled in release builds; it is only edited on request.
  bool _editServer = false;

  @override
  void initState() {
    super.initState();
    ref.read(serverUrlProvider.future).then((url) {
      if (!mounted || _server.text.isNotEmpty) return;
      setState(() {
        _server.text = url;
        _editServer = checkServerUrl(url) != null;
      });
    });
  }

  @override
  void dispose() {
    _server.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String? _validateUrl(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return context.l10n.fieldRequired;
    return switch (checkServerUrl(text)) {
      ServerUrlProblem.invalid => context.l10n.invalidUrl,
      ServerUrlProblem.insecure => context.l10n.insecureUrl,
      null => null,
    };
  }

  Future<void> _submit() async {
    if (!_editServer && checkServerUrl(_server.text) != null) {
      setState(() => _editServer = true);
      return;
    }
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await ref.read(authControllerProvider.notifier).login(
          serverUrl: _server.text,
          email: _email.text,
          password: _password.text,
        );
    if (!mounted) return;
    final state = ref.read(authControllerProvider);
    if (state.hasError) {
      final error = state.error;
      final message = error == null ? context.l10n.genericError : apiErrorText(context.l10n, error);
      showMessage(context, context.l10n.loginFailed(message));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final loading = ref.watch(authControllerProvider).isLoading;
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Center(child: BrandMark(size: 88)),
                      const SizedBox(height: 16),
                      Text(
                        l10n.appTitle,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        l10n.appTagline,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: 32),
                      Text(l10n.loginTitle, style: theme.textTheme.titleMedium),
                      const SizedBox(height: 12),
                      if (_editServer) ...[
                        TextFormField(
                          key: const Key('login-server'),
                          controller: _server,
                          keyboardType: TextInputType.url,
                          decoration: InputDecoration(labelText: l10n.serverUrl, hintText: l10n.serverUrlHint),
                          validator: _validateUrl,
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        decoration: InputDecoration(labelText: l10n.email),
                        validator: (v) => (v?.trim().isEmpty ?? true) ? l10n.fieldRequired : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: const [AutofillHints.password],
                        decoration: InputDecoration(
                          labelText: l10n.password,
                          suffixIcon: IconButton(
                            icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                            onPressed: () => setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: (v) => (v?.isEmpty ?? true) ? l10n.fieldRequired : null,
                        onFieldSubmitted: (_) => _submit(),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                        onPressed: loading ? null : _submit,
                        child: loading
                            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(l10n.loginButton),
                      ),
                      if (!_editServer) ...[
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.dns_outlined, size: 16, color: theme.colorScheme.onSurfaceVariant),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                Uri.tryParse(_server.text)?.host ?? _server.text,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                              ),
                            ),
                            TextButton(
                              key: const Key('login-change-server'),
                              onPressed: () => setState(() => _editServer = true),
                              child: Text(l10n.changeServer),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
