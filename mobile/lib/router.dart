import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/providers.dart';
import 'data/models/branch.dart';
import 'features/auth/login_screen.dart';
import 'features/branches/branch_detail_screen.dart';
import 'features/branches/branches_screen.dart';
import 'features/camera/camera_capture_screen.dart';
import 'features/gap/gap_controller.dart';
import 'features/gap/gap_result_screen.dart';
import 'features/gap/gap_screen.dart';
import 'features/home/home_screen.dart';
import 'features/results/results_screen.dart';
import 'features/results/run_controller.dart';
import 'features/settings/cuisine_settings_screen.dart';
import 'features/settings/model_settings_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/shell/app_shell.dart';
import 'features/templates/templates_screen.dart';
import 'features/usage/usage_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authControllerProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/suggest',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final location = state.matchedLocation;
      if (!auth.hasValue && auth.isLoading) return location == '/splash' ? null : '/splash';
      final loggedIn = auth.value != null;
      if (!loggedIn) return location == '/login' ? null : '/login';
      if (location == '/login' || location == '/splash') return '/suggest';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/camera',
        builder: (_, state) {
          final extra = state.extra;
          return CameraCaptureScreen(maxShots: extra is int ? extra : 5);
        },
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/suggest',
                builder: (_, _) => const HomeScreen(),
                routes: [
                  GoRoute(
                    path: 'results',
                    builder: (_, state) {
                      final extra = state.extra;
                      return ResultsScreen(
                        request: extra is RunRequest ? extra : null,
                        runId: state.uri.queryParameters['runId'],
                        branchId: state.uri.queryParameters['branchId'],
                      );
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/gap',
                builder: (_, _) => const GapScreen(),
                routes: [
                  GoRoute(
                    path: 'result',
                    builder: (_, state) {
                      final extra = state.extra;
                      return GapResultScreen(
                        request: extra is GapRequest ? extra : null,
                        branch: extra is Branch ? extra : null,
                        runId: state.uri.queryParameters['runId'],
                      );
                    },
                  ),
                  GoRoute(
                    path: 'card',
                    builder: (_, state) {
                      final extra = state.extra;
                      return ResultsScreen(
                        request: extra is RunRequest ? extra : null,
                        runId: state.uri.queryParameters['runId'],
                        branchId: state.uri.queryParameters['branchId'],
                        slot: runSlotGap,
                      );
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/branches',
                builder: (_, _) => const BranchesScreen(),
                routes: [
                  // Listed before ':id' so "card" is not taken for a branch id.
                  GoRoute(
                    path: 'card',
                    builder: (_, state) {
                      final extra = state.extra;
                      return ResultsScreen(
                        request: extra is RunRequest ? extra : null,
                        runId: state.uri.queryParameters['runId'],
                        branchId: state.uri.queryParameters['branchId'],
                        slot: runSlotBranches,
                      );
                    },
                  ),
                  GoRoute(
                    path: ':id',
                    builder: (_, state) => BranchDetailScreen(branchId: state.pathParameters['id'] ?? ''),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(routes: [GoRoute(path: '/templates', builder: (_, _) => const TemplatesScreen())]),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (_, _) => const SettingsScreen(),
                routes: [
                  GoRoute(path: 'cuisines', builder: (_, _) => const CuisineSettingsScreen()),
                  GoRoute(path: 'models', builder: (_, _) => const ModelSettingsScreen()),
                  GoRoute(path: 'usage', builder: (_, _) => const UsageScreen()),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
