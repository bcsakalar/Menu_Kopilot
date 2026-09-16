import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../data/models/settings.dart';

final providerSettingsProvider =
    FutureProvider.autoDispose<ProviderSettings>((ref) => ref.watch(apiClientProvider).providerSettings());

/// Per-task primary model (the rest of the chain stays as fallback). Keys live on the server only; the phone just
/// picks among the models the server offers for each task.
class ModelSettingsScreen extends ConsumerStatefulWidget {
  const ModelSettingsScreen({super.key});

  @override
  ConsumerState<ModelSettingsScreen> createState() => _ModelSettingsScreenState();
}

class _ModelSettingsScreenState extends ConsumerState<ModelSettingsScreen> {
  String? _saving;

  Future<void> _setPrimary(TaskSettings task, String model) async {
    setState(() => _saving = task.taskKey);
    try {
      await ref.read(apiClientProvider).setPrimaryModel(task.taskKey, model);
      ref.invalidate(providerSettingsProvider);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, apiErrorText(context.l10n, e));
    } finally {
      if (mounted) setState(() => _saving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final settings = ref.watch(providerSettingsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.aiModels)),
      body: settings.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => EmptyState(
          icon: Icons.cloud_off,
          message: l10n.networkError,
          action: FilledButton(onPressed: () => ref.invalidate(providerSettingsProvider), child: Text(l10n.retry)),
        ),
        data: (data) => ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            if (data.localOnlyMode) MaterialBanner(content: Text(l10n.localOnlyOn), actions: const [SizedBox.shrink()]),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Wrap(
                spacing: 8,
                children: [
                  for (final provider in data.providers)
                    Chip(
                      avatar: Icon(
                        provider.configured && provider.circuit == 'closed' ? Icons.check_circle : Icons.error_outline,
                        size: 18,
                        color: provider.configured && provider.circuit == 'closed' ? Colors.green : Colors.orange,
                      ),
                      label: Text('${provider.name} · ${provider.configured ? l10n.providerReady : l10n.providerNoKey}'),
                    ),
                ],
              ),
            ),
            Padding(padding: const EdgeInsets.all(16), child: Text(l10n.aiModelsHelp, style: Theme.of(context).textTheme.bodySmall)),
            for (final task in data.tasks)
              ListTile(
                key: ValueKey('task-${task.taskKey}'),
                title: Text(task.label),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DropdownButton<String>(
                      isExpanded: true,
                      value: task.eligibleModels.any((m) => m.id == task.primaryModel) ? task.primaryModel : null,
                      items: [
                        for (final model in task.eligibleModels)
                          DropdownMenuItem(
                            value: model.id,
                            child: Text('${model.label}${model.preview ? ' (${l10n.preview})' : ''}', overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: _saving != null || task.eligibleModels.length < 2
                          ? null
                          : (value) {
                              if (value != null && value != task.primaryModel) _setPrimary(task, value);
                            },
                    ),
                    if (task.chain.length > 1)
                      Text(
                        l10n.fallbackChain(task.chain.skip(1).map((r) => r.label).join(' → ')),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                  ],
                ),
                trailing: _saving == task.taskKey ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : null,
              ),
          ],
        ),
      ),
    );
  }
}
