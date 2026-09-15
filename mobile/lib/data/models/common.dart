import 'json.dart';

class Cuisine {
  const Cuisine({
    required this.id,
    required this.name,
    required this.slug,
    this.parentId,
    this.isSystem = false,
    this.minItemCount = 10,
    this.targetItemCount = 10,
    this.notes,
    this.templateCount = 0,
  });

  factory Cuisine.fromJson(Json json) => Cuisine(
        id: json.str('id'),
        name: json.str('name'),
        slug: json.str('slug'),
        parentId: json.strOrNull('parentId'),
        isSystem: json.boolean('isSystem'),
        minItemCount: json.integer('minItemCount', 10),
        targetItemCount: json.integer('targetItemCount', 10),
        notes: json.strOrNull('notes'),
        templateCount: json.integer('templateCount'),
      );

  final String id;
  final String name;
  final String slug;
  final String? parentId;
  final bool isSystem;
  final int minItemCount;
  final int targetItemCount;
  final String? notes;
  final int templateCount;

  Json toJson() => {
        'id': id,
        'name': name,
        'slug': slug,
        'parentId': parentId,
        'isSystem': isSystem,
        'minItemCount': minItemCount,
        'targetItemCount': targetItemCount,
        'notes': notes,
        'templateCount': templateCount,
      };
}

class AuthUser {
  const AuthUser({required this.id, required this.email, required this.name, required this.role});

  factory AuthUser.fromJson(Json json) =>
      AuthUser(id: json.str('id'), email: json.str('email'), name: json.str('name'), role: json.str('role', 'uzman'));

  final String id;
  final String email;
  final String name;
  final String role;

  Json toJson() => {'id': id, 'email': email, 'name': name, 'role': role};
}

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.deviceId,
    required this.user,
  });

  factory AuthSession.fromJson(Json json) => AuthSession(
        accessToken: json.str('accessToken'),
        refreshToken: json.str('refreshToken'),
        deviceId: json.str('deviceId'),
        user: AuthUser.fromJson(json.object('user') ?? const {}),
      );

  final String accessToken;
  final String refreshToken;
  final String deviceId;
  final AuthUser user;

  Json toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'deviceId': deviceId,
        'user': user.toJson(),
      };
}
