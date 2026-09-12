import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { assignmentValues, assignmentsForSection, displayStatus, formatCurrentLocation, formSections, isFormComplete, isReportLocked } from "./domain";
import { colors } from "./theme";
import { deviceName, StoreProvider, useStore } from "./store";
import { deviceAudit, networkAudit, sha256File, timezone } from "./audit";
import { greetingBannerSpec } from "./greetingBanner";
import type { Assignment, DisplayStatus, FormField } from "./types";

type Tab = "Overview" | "Assignments" | "Inspections" | "Drafts" | "Sync";

const tabs: { label: Tab; icon: keyof typeof Ionicons.glyphMap; color: string; pale: string }[] = [
  { label: "Overview", icon: "apps-outline", color: colors.primary, pale: colors.paleStrong },
  { label: "Assignments", icon: "briefcase-outline", color: colors.blue, pale: colors.bluePale },
  { label: "Inspections", icon: "shield-checkmark-outline", color: colors.violet, pale: colors.violetPale },
  { label: "Drafts", icon: "document-text-outline", color: colors.amber, pale: colors.amberPale },
  { label: "Sync", icon: "cloud-upload-outline", color: colors.cyan, pale: colors.cyanPale },
];
const reaLogo = require("../assets/rea-logo.png");
const greetingBannerArtwork = require("../assets/greeting-banner-reference.jpg");

async function persistEvidence(uri: string, type: "photo" | "video") {
  if (!FileSystem.documentDirectory) return uri;
  const directory = `${FileSystem.documentDirectory}inspection-evidence/`;
  const extension = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] ?? (type === "video" ? "mp4" : "jpg");
  const destination = `${directory}${type}-${Date.now()}.${extension}`;
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch {
    return uri;
  }
}

function AppRoot() {
  const { hydrated, signedIn } = useStore();
  if (!hydrated) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  return signedIn ? <FieldOfficerApp /> : <LoginScreen />;
}

function LoginScreen() {
  const { login } = useStore();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const ok = await login(identifier, password);
    if (!ok) setError("Invalid field officer phone/email or password.");
    setBusy(false);
  };

  return (
    <SafeAreaView style={styles.loginSafe}>
      <StatusBar hidden />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.loginWrap}>
        <Image source={reaLogo} style={styles.brandMark} resizeMode="contain" />
        <Text style={styles.loginBrand}>VERITAS</Text>
        <Text style={styles.loginAgency}>RURAL ELECTRIFICATION AGENCY</Text>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>Field Officer Sign In</Text>
          <Text style={styles.loginSubtitle}>Access assigned projects and complete secure field inspections.</Text>
          <FieldLabel label="Phone number or email">
            <TextInput value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="default" style={styles.input} />
          </FieldLabel>
          <FieldLabel label="Password">
            <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
          </FieldLabel>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable onPress={() => void submit()} disabled={busy} style={styles.primaryButton}>
            {busy ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="log-in-outline" size={18} color={colors.white} /><Text style={styles.primaryButtonText}>Sign in securely</Text></>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Screen = "main" | "profile" | "settings" | "help";

function FieldOfficerApp() {
  const { officerName, isOnline } = useStore();
  const [tab, setTab] = useState<Tab>("Overview");
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [view, setView] = useState<Screen>("main");
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar hidden />
      {view === "main" ? (
        <View style={styles.header}>
          <View style={styles.headerBrand}><Image source={reaLogo} style={styles.headerLogo} resizeMode="contain" /><View><Text style={styles.headerTitle}>Veritas</Text><Text style={styles.headerSubtitle}>REA · FIELD OFFICER</Text></View></View>
          <View style={styles.headerActions}>
            <View style={styles.onlinePill}><View style={[styles.onlineDot, !isOnline && styles.offlineDot]} /><Text style={[styles.onlineText, !isOnline && { color: colors.amber }]}>{isOnline ? "ONLINE" : "OFFLINE"}</Text></View>
            <Pressable onPress={() => setView("profile")} style={styles.avatar}><Text style={styles.avatarText}>{initials(officerName)}</Text></Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.backHeader}>
          <Pressable onPress={() => setView(view === "profile" ? "main" : "profile")} style={styles.iconButton}><Ionicons name="chevron-back" size={22} color={colors.deep} /></Pressable>
          <Text style={styles.backHeaderTitle}>{view === "profile" ? "Profile" : view === "settings" ? "Settings" : "Help & Support"}</Text>
          <View style={styles.iconButton} />
        </View>
      )}
      <View style={styles.page}>
        {view === "main" && tab === "Overview" && <Overview onOpen={setSelected} onNavigate={setTab} />}
        {view === "main" && tab === "Assignments" && <AssignmentList mode="assignments" onOpen={setSelected} />}
        {view === "main" && tab === "Inspections" && <AssignmentList mode="inspections" onOpen={setSelected} />}
        {view === "main" && tab === "Drafts" && <AssignmentList mode="drafts" onOpen={setSelected} />}
        {view === "main" && tab === "Sync" && <SyncScreen />}
        {view === "profile" && <ProfileScreen onOpenSettings={() => setView("settings")} onOpenHelp={() => setView("help")} />}
        {view === "settings" && <SettingsScreen />}
        {view === "help" && <HelpScreen />}
      </View>
      <View style={styles.tabBar}>
        {tabs.map((item, index) => {
          const isLast = index === tabs.length - 1;
          const asProfile = isLast && view !== "main";
          const display = asProfile ? { label: "Profile", icon: "person-outline" as const, color: colors.primary, pale: colors.paleStrong } : item;
          const active = asProfile ? true : view === "main" && item.label === tab;
          return <AnimatedTab key={item.label} item={display} active={active} onPress={() => { setView("main"); setTab(item.label); }} />;
        })}
      </View>
      <InspectionModal assignment={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

function ProfileScreen({ onOpenSettings, onOpenHelp }: { onOpenSettings: () => void; onOpenHelp: () => void }) {
  const { officerName, logout } = useStore();
  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void }[] = [
    { icon: "person-outline", label: "Personal Information", onPress: () => Alert.alert("Personal Information", "Contact your consultant admin to update these details.") },
    { icon: "lock-closed-outline", label: "Change Password", onPress: () => Alert.alert("Change Password", "Password changes are managed from Settings.") },
    { icon: "options-outline", label: "App Settings", onPress: onOpenSettings },
    { icon: "map-outline", label: "Offline Maps", onPress: () => Alert.alert("Offline Maps", "Downloaded map tiles will appear here.") },
    { icon: "help-circle-outline", label: "Help & Support", onPress: onOpenHelp },
    { icon: "information-circle-outline", label: "About Veritas", onPress: () => Alert.alert("About Veritas", "Veritas Field Officer v1.0.0") },
  ];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileHero}>
        <View style={styles.profileHeroAvatar}><Text style={styles.profileHeroAvatarText}>{initials(officerName)}</Text></View>
        <Text style={styles.profileHeroName}>{officerName}</Text>
        <Text style={styles.profileHeroRole}>Field Officer</Text>
        <Text style={styles.profileHeroFirm}>Supreme Nigeria Limited</Text>
        <View style={styles.profileStatusPill}><View style={styles.onlineDot} /><Text style={styles.onlineText}>Active</Text></View>
      </View>
      <View style={styles.listPanel}>
        {rows.map((row, index) => <MenuRow key={row.label} icon={row.icon} label={row.label} onPress={row.onPress} last={index === rows.length - 1} />)}
      </View>
      <Pressable onPress={() => void logout()} style={styles.logoutRow}><Ionicons name="log-out-outline" size={18} color={colors.red} /><Text style={styles.logoutText}>Logout</Text></Pressable>
    </ScrollView>
  );
}

function SettingsScreen() {
  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string }[] = [
    { icon: "notifications-outline", label: "Notifications" },
    { icon: "location-outline", label: "Location Services", value: "Enabled" },
    { icon: "camera-outline", label: "Camera & Photos" },
    { icon: "cloud-offline-outline", label: "Offline Mode", value: "Enabled" },
    { icon: "stats-chart-outline", label: "Data Usage" },
    { icon: "globe-outline", label: "Language", value: "English" },
  ];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.listPanel}>
        {rows.map((row, index) => <MenuRow key={row.label} icon={row.icon} label={row.label} value={row.value} last={index === rows.length - 1} onPress={() => Alert.alert(row.label, "This setting is managed by your consultant admin.")} />)}
      </View>
    </ScrollView>
  );
}

function HelpScreen() {
  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; text: string }[] = [
    { icon: "book-outline", label: "User Guide", text: "Step-by-step instructions" },
    { icon: "play-circle-outline", label: "Video Tutorials", text: "Watch how to use the app" },
    { icon: "help-circle-outline", label: "Frequently Asked Questions", text: "Find quick answers" },
    { icon: "headset-outline", label: "Contact Support", text: "Get in touch with the Veritas team" },
    { icon: "shield-outline", label: "Report an Issue", text: "Send feedback or bug report" },
  ];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.searchBar}><Ionicons name="search-outline" size={16} color={colors.slate} /><Text style={styles.searchPlaceholder}>Search help topics...</Text></View>
      <View style={styles.listPanel}>
        {rows.map((row, index) => (
          <Pressable key={row.label} onPress={() => Alert.alert(row.label, "This resource is not available in the offline demo build.")} style={[styles.helpRow, index === rows.length - 1 && styles.menuRowLast]}>
            <View style={styles.helpIcon}><Ionicons name={row.icon} size={18} color={colors.primary} /></View>
            <View style={styles.menuInfo}><Text style={styles.menuLabel}>{row.label}</Text><Text style={styles.helpText}>{row.text}</Text></View>
            <Ionicons name="chevron-forward" size={16} color={colors.slate} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function MenuRow({ icon, label, value, onPress, last = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.menuRow, last && styles.menuRowLast]}>
      <View style={styles.menuIcon}><Ionicons name={icon} size={18} color={colors.primary} /></View>
      <View style={styles.menuInfo}><Text style={styles.menuLabel}>{label}</Text></View>
      {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.slate} />
    </Pressable>
  );
}

function AnimatedTab({ item, active, onPress }: { item: { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; pale: string }; active: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, useNativeDriver: true, speed: 28, bounciness: 7 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 5 }),
    ]).start();
  }, [active, scale]);
  return (
    <Pressable onPress={onPress} onPressIn={() => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start()} onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()} style={[styles.tab, active && { backgroundColor: item.pale }]}>
      <Animated.View style={[styles.tabIcon, { backgroundColor: active ? item.color : item.pale, transform: [{ scale }] }]}><Ionicons name={item.icon} size={19} color={active ? colors.white : item.color} /></Animated.View>
      <Text style={[styles.tabText, active && { color: item.color }]}>{item.label}</Text>
    </Pressable>
  );
}

function Overview({ onOpen, onNavigate }: { onOpen: (item: Assignment) => void; onNavigate: (tab: Tab) => void }) {
  const { assignments, officerName, consultantFirm } = useStore();
  const [locationLabel, setLocationLabel] = useState("Locating...");
  const assigned = assignments.filter((item) => item.status === "Assigned");
  const drafts = assignments.filter((item) => item.status === "Draft");
  const dueThisWeek = assignments.filter((item) => ["Assigned", "Draft"].includes(item.status) && new Date(item.dueDate).getTime() <= Date.now() + 7 * 86_400_000);
  const toSync = assignments.filter((item) => item.syncStatus !== "synced");
  const recent = assignmentsForSection(assignments, "inspections")
    .slice()
    .sort((a, b) => new Date(b.report?.updatedAt ?? b.dueDate).getTime() - new Date(a.report?.updatedAt ?? a.dueDate).getTime())
    .slice(0, 3);
  const next = drafts[0] ?? assigned[0];

  useEffect(() => {
    let active = true;
    const resolveLocation = async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          if (active) setLocationLabel("Location unavailable");
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (active) setLocationLabel(place ? formatCurrentLocation(place) : "Location unavailable");
      } catch {
        if (active) setLocationLabel("Location unavailable");
      }
    };
    void resolveLocation();
    return () => { active = false; };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.greetingBanner}>
        <View style={styles.greetingArtwork} accessibilityLabel={greetingBannerSpec.slogan}>
          <Image source={greetingBannerArtwork} style={styles.greetingArtworkImage} resizeMode="stretch" />
        </View>
        <View style={styles.greetingLeftTint} />
        <View style={styles.greetingContent}>
          <View style={styles.greetingTopRow}>
            <View style={styles.sunBadge}><Ionicons name="sunny" size={23} color="#F6B817" /></View>
            <View style={styles.greetingIdentity}>
              <Text style={styles.greeting} numberOfLines={1}>Good day, {officerName.split(" ")[0]}.</Text>
              <Text style={styles.greetingFirm} numberOfLines={1}>{consultantFirm}</Text>
            </View>
          </View>
          <View style={styles.greetingMetaRow}>
            <View style={styles.greetingLocation}>
              <Ionicons name="location" size={15} color={colors.primary} />
              <Text style={styles.greetingLocationText} numberOfLines={1}>{locationLabel}</Text>
            </View>
            <View style={styles.greetingDivider} />
            <Ionicons name="sunny" size={14} color="#EFAF12" />
            <Text style={styles.greetingWeatherText} numberOfLines={1}>{greetingBannerSpec.weather}</Text>
          </View>
        </View>
      </View>
      <View style={styles.metricsGrid}>
        <Metric label="Assigned" value={assigned.length} note="Ready to start" icon="grid-outline" tone="green" onPress={() => onNavigate("Assignments")} />
        <Metric label="Due" value={dueThisWeek.length} note="Next visit" icon="time-outline" tone="amber" onPress={() => onNavigate("Assignments")} />
        <Metric label="Drafts" value={drafts.length} note="Not yet submitted" icon="document-text-outline" tone="blue" onPress={() => onNavigate("Drafts")} />
        <Metric label="To Sync" value={toSync.length} note="Ready to upload" icon="cloud-upload-outline" tone="violet" onPress={() => onNavigate("Sync")} />
      </View>
      {next ? (
        <View style={styles.nextCard}>
          <View style={styles.assignmentTop}>
            <View style={styles.projectIcon}><Ionicons name="flash-outline" size={21} color={colors.primary} /></View>
            <View style={styles.assignmentMain}><Text style={styles.eyebrow}>CURRENT ASSIGNMENT</Text><Text style={styles.cardTitle}>{next.projectName}</Text></View>
            <StatusBadge status={displayStatus(next.status)} />
          </View>
          <View style={styles.metaRow}>
            <Meta label="Programme" value={next.programme} />
            <Meta label="Component" value={next.component} />
            <Meta label="Site" value={`${next.community}, ${next.state}`} />
          </View>
          <Pressable style={styles.outlineButton} onPress={() => openMaps(next)}><Ionicons name="navigate-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Navigate to site</Text></Pressable>
          <Pressable style={styles.primaryButton} onPress={() => onOpen(next)}><Text style={styles.primaryButtonText}>{next.status === "Draft" ? "Continue inspection" : "Start inspection"}</Text><Ionicons name="arrow-forward" size={17} color={colors.white} /></Pressable>
        </View>
      ) : null}
      <View style={styles.listPanel}>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Recent Inspections</Text><Pressable onPress={() => onNavigate("Inspections")} style={styles.viewAllButton}><Text style={styles.viewAll}>See all</Text><Ionicons name="arrow-forward" size={15} color={colors.primary} /></Pressable></View>
        {recent.length ? recent.map((item) => <RecentInspectionRow key={item.id} item={item} onOpen={onOpen} />) : <EmptyState icon="checkmark-done-circle-outline" title="No inspections yet" text="Submitted inspections will appear here." />}
      </View>
    </ScrollView>
  );
}

function RecentInspectionRow({ item, onOpen }: { item: Assignment; onOpen: (item: Assignment) => void }) {
  const at = item.report?.updatedAt ?? item.report?.submittedAt ?? item.dueDate;
  return (
    <Pressable onPress={() => onOpen(item)} style={styles.recentRow}>
      <View style={styles.projectIcon}><Ionicons name="grid-outline" size={18} color={colors.primary} /></View>
      <View style={styles.assignmentMain}><Text style={styles.recentTitle} numberOfLines={1}>{item.projectName}</Text><Text style={styles.assignmentId}>{item.component} · {item.community}, {item.state}</Text></View>
      <View style={styles.recentEnd}><StatusBadge status={displayStatus(item.status)} /><Text style={styles.recentTime}>{timeAgo(at)}</Text></View>
    </Pressable>
  );
}

function AssignmentList({ mode, onOpen }: { mode: "assignments" | "inspections" | "drafts"; onOpen: (item: Assignment) => void }) {
  const { assignments } = useStore();
  const base = assignmentsForSection(assignments, mode);
  const title = mode === "drafts" ? "Drafts" : mode === "assignments" ? "Assignments" : "Inspections";
  const subtitle = mode === "drafts" ? "Forms you started are autosaved here" : mode === "assignments" ? "Projects ready for field inspection" : "Submitted and reviewed field inspections";
  const summaries = mode === "assignments"
    ? [
        { label: "Assigned", value: base.length, icon: "folder-open-outline" as const, tone: "green" as const },
        { label: "Due this week", value: base.filter((item) => new Date(item.dueDate).getTime() <= Date.now() + 7 * 86_400_000).length, icon: "calendar-outline" as const, tone: "amber" as const },
        { label: "States", value: new Set(base.map((item) => item.state)).size, icon: "map-outline" as const, tone: "blue" as const },
      ]
    : mode === "drafts"
      ? [
          { label: "Autosaved", value: base.length, icon: "cloud-done-outline" as const, tone: "green" as const },
          { label: "With evidence", value: base.filter((item) => (item.report?.evidence.length ?? 0) > 0).length, icon: "camera-outline" as const, tone: "blue" as const },
          { label: "To complete", value: base.length, icon: "create-outline" as const, tone: "amber" as const },
        ]
      : [
          { label: "Submitted", value: base.filter((item) => item.status === "Submitted").length, icon: "paper-plane-outline" as const, tone: "blue" as const },
          { label: "Approved", value: base.filter((item) => item.status === "Approved").length, icon: "checkmark-circle-outline" as const, tone: "green" as const },
          { label: "Verified", value: base.filter((item) => item.status === "Verified").length, icon: "shield-checkmark-outline" as const, tone: "green" as const },
          { label: "Re-inspection", value: base.filter((item) => item.status === "Re-inspection").length, icon: "refresh-outline" as const, tone: "amber" as const },
        ];
  return (
    <FlatList data={base} keyExtractor={(item) => item.id} contentContainerStyle={[styles.scrollContent, styles.listContent]} ListHeaderComponent={<><View style={styles.heroCopy}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryStrip}>{summaries.map((item) => <SummaryCard key={item.label} {...item} />)}</ScrollView><Text style={styles.listLabel}>{mode === "drafts" ? "Autosaved forms" : mode === "assignments" ? "Assignment list" : "Inspection history"}</Text></>} renderItem={({ item }) => <AssignmentCard item={item} onOpen={onOpen} />} ListEmptyComponent={<EmptyState icon={mode === "drafts" ? "document-text-outline" : "checkmark-done-outline"} title={mode === "drafts" ? "No drafts" : "Nothing here"} text={mode === "drafts" ? "A form appears here automatically after you start filling it." : "No records are available in this section."} />} />
  );
}

function SyncScreen() {
  const { assignments, isOnline, syncNow } = useStore();
  const pending = assignments.filter((item) => item.syncStatus !== "synced");
  const waiting = assignments.filter((item) => item.syncStatus === "queued" || item.syncStatus === "failed");
  const uploading = assignments.filter((item) => item.syncStatus === "uploading");
  const completed = assignments.filter((item) => item.syncStatus === "synced");
  const [busy, setBusy] = useState(false);
  const sync = async () => { setBusy(true); await syncNow(); setBusy(false); };
  return (
    <ScrollView contentContainerStyle={[styles.scrollContent, styles.listContent]} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCopy}><Text style={styles.pageTitle}>Sync</Text><Text style={styles.pageSubtitle}>Uploads continue safely when an internet connection is available.</Text></View>
      <View style={styles.syncBanner}>
        <View style={styles.syncBannerIcon}><Ionicons name="cloud-upload-outline" size={21} color={colors.blue} /></View>
        <View style={styles.assignmentMain}>
          <Text style={styles.syncBannerTitle}>{pending.length ? "Ready to sync" : "All synced"}</Text>
          <Text style={styles.syncBannerText}>{pending.length ? `${pending.length} item${pending.length === 1 ? "" : "s"} ready to upload` : "Nothing waiting to upload"}</Text>
        </View>
        <Pressable disabled={!isOnline || !pending.length || busy} onPress={() => void sync()} style={[styles.syncNowButton, (!isOnline || !pending.length || busy) && styles.disabled]}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.syncNowButtonText}>{isOnline ? "Sync Now" : "Offline"}</Text>}
        </Pressable>
      </View>
      <View style={styles.syncSummary}><MetricMini label="Uploading" value={uploading.length || (busy ? 1 : 0)} icon="cloud-upload-outline" color={colors.blue} /><MetricMini label="Waiting" value={waiting.length} icon="time-outline" color={colors.amber} /><MetricMini label="Completed" value={completed.length} icon="checkmark-circle-outline" color={colors.primary} /></View>
      <Text style={styles.listLabel}>Waiting to upload</Text>
      {pending.length ? pending.map((item) => <SyncQueueCard key={item.id} item={item} />) : <View style={styles.listPanel}><EmptyState icon="checkmark-done-circle-outline" title="Everything is synchronized" text="There are no inspection packages waiting to upload." /></View>}
      <Text style={styles.securityNote}>GPS coordinates, timestamps, evidence and signatories stay attached to every inspection package.</Text>
    </ScrollView>
  );
}

function SyncQueueCard({ item }: { item: Assignment }) {
  const evidenceCount = item.report?.evidence.length ?? 0;
  const tone = item.syncStatus === "uploading" ? colors.blue : item.syncStatus === "failed" ? colors.red : colors.amber;
  const pale = item.syncStatus === "uploading" ? colors.bluePale : item.syncStatus === "failed" ? colors.redPale : colors.amberPale;
  const label = item.syncStatus === "uploading" ? "Uploading…" : item.syncStatus === "failed" ? "Failed" : "Waiting…";
  return (
    <View style={styles.queueItemCard}>
      <View style={styles.projectIcon}><Ionicons name="grid-outline" size={18} color={colors.primary} /></View>
      <View style={styles.assignmentMain}>
        <Text style={styles.assignmentName} numberOfLines={1}>{item.projectName}</Text>
        <Text style={styles.assignmentId}>{item.id} · {evidenceCount} evidence file{evidenceCount === 1 ? "" : "s"}</Text>
      </View>
      <View style={[styles.syncStatusPill, { backgroundColor: pale }]}><Text style={[styles.syncStatusText, { color: tone }]}>{label}</Text></View>
    </View>
  );
}

function InspectionModal({ assignment, onClose }: { assignment: Assignment | null; onClose: () => void }) {
  const { assignments, officerId, consultantFirm, sessionId, verifyArrival, saveDraft, addEvidence, submitReport } = useStore();
  const live = assignment ? assignments.find((item) => item.id === assignment.id) ?? assignment : null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [communitySignatory, setCommunitySignatory] = useState("");
  const [contractorSignatory, setContractorSignatory] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [sectionIndex, setSectionIndex] = useState(0);
  const workflowLocked = live ? isReportLocked(live.status) : false;
  const gpsLocked = Boolean(live && !live.arrival);
  const formLocked = workflowLocked || gpsLocked;
  const sections = live ? formSections[live.component] : [];

  useEffect(() => {
    if (!live) return;
    setValues(assignmentValues(live));
    setCommunitySignatory(live.report?.communitySignatory ?? "");
    setContractorSignatory(live.report?.contractorSignatory ?? "");
    setSectionIndex(0);
    setGpsMessage("");
  }, [live?.id]);

  useEffect(() => {
    if (!live || formLocked || !Object.keys(values).length) return;
    const timer = setTimeout(() => saveDraft(live.id, values, communitySignatory, contractorSignatory), 350);
    return () => clearTimeout(timer);
  }, [values, communitySignatory, contractorSignatory, live?.id, formLocked]);

  if (!live) return null;

  const checkGps = async () => {
    setGpsBusy(true);
    const result = await verifyArrival(live.id);
    setGpsMessage(result.ok ? `Arrival verified · ${Math.round(result.distanceMetres)} m from project centre.` : result.message);
    setGpsBusy(false);
  };
  const captureEvidence = async (type: "photo" | "video") => {
    if (!live.arrival) return Alert.alert("GPS required", "Verify arrival before capturing evidence.");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission required");
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: [type === "video" ? "videos" : "images"],
      quality: 0.8,
      videoMaxDuration: 60,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return Alert.alert("Evidence unavailable", "The camera did not return a media file. Please try again.");
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
    const uri = await persistEvidence(asset.uri, type);
    const capturedAt = new Date().toISOString();
    const [integrityHash, network, fileInfo] = await Promise.all([
      sha256File(uri).catch(() => ""),
      networkAudit(),
      FileSystem.getInfoAsync(uri),
    ]);
    if (!integrityHash) return Alert.alert("Evidence not saved", "The app could not create the evidence integrity hash. Please capture it again.");
    const evidenceResult = addEvidence(live.id, {
      id: `${live.id}-${Date.now()}`,
      uri,
      type,
      capturedAt,
      latitude: current?.coords.latitude ?? live.arrival.latitude,
      longitude: current?.coords.longitude ?? live.arrival.longitude,
      projectId: live.projectId ?? live.id,
      inspector: live.officer,
      deviceName: deviceName(),
      assignmentId: live.id,
      programme: live.programme,
      component: live.component,
      contractor: live.contractor,
      officerId,
      consultantFirm,
      sessionId,
      timezone: timezone(),
      gpsAccuracyMetres: current?.coords.accuracy ?? live.arrival.accuracyMetres,
      altitudeMetres: current?.coords.altitude ?? live.arrival.altitudeMetres,
      headingDegrees: current?.coords.heading ?? live.arrival.headingDegrees,
      speedMetresPerSecond: current?.coords.speed ?? live.arrival.speedMetresPerSecond,
      mocked: current?.mocked ?? live.arrival.mocked,
      captureSequence: (live.report?.evidence.length ?? 0) + 1,
      durationSeconds: type === "video" && asset.duration ? asset.duration / 1000 : null,
      fileSizeBytes: asset.fileSize ?? (fileInfo.exists && "size" in fileInfo ? fileInfo.size : null),
      integrityAlgorithm: "SHA-256",
      integrityHash,
      ...network,
      device: deviceAudit(),
    });
    if (!evidenceResult.ok) Alert.alert("Evidence not saved", evidenceResult.message);
  };
  const submit = async () => {
    if (!live.arrival) return Alert.alert("GPS required", "Verify arrival before filling or submitting the form.");
    if (!isFormComplete(live.component, values)) return Alert.alert("Incomplete form", "Complete every required field before submission.");
    const result = await submitReport(live.id, values, communitySignatory, contractorSignatory);
    Alert.alert(result.ok ? "Submitted" : "Submission blocked", result.message, result.ok ? [{ text: "Done", onPress: onClose }] : undefined);
  };
  const section = sections[sectionIndex];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}><StatusBar hidden /><View style={styles.modalHeader}><Pressable onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={24} color={colors.deep} /></Pressable><View style={styles.modalTitleWrap}><Text numberOfLines={1} style={styles.modalTitle}>{live.projectName}</Text><Text style={styles.modalSubtitle}>{live.id} · {live.component}</Text></View><StatusBadge status={displayStatus(live.status)} /></View><ScrollView contentContainerStyle={styles.inspectionContent} keyboardShouldPersistTaps="handled"><View style={styles.gpsCard}><View style={styles.gpsIcon}><Ionicons name={live.arrival ? "shield-checkmark" : "location"} size={24} color={live.arrival ? colors.primary : colors.amber} /></View><View style={styles.gpsCopy}><Text style={styles.gpsTitle}>{live.arrival ? "Arrival verified" : "GPS verification required"}</Text><Text style={styles.gpsText}>{live.arrival ? `${Math.round(live.arrival.distanceMetres)} m from approved project centre${live.arrival.accuracyMetres ? ` · ±${Math.round(live.arrival.accuracyMetres)} m accuracy` : ""}` : "The form stays locked until you are verified within 250 m."}</Text></View></View>{gpsMessage ? <Text style={[styles.gpsMessage, gpsMessage.startsWith("Verification blocked") && styles.gpsError]}>{gpsMessage}</Text> : null}<View style={styles.actionRow}><Pressable style={styles.outlineButton} onPress={() => openMaps(live)}><Ionicons name="navigate-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Open Maps</Text></Pressable><Pressable disabled={gpsBusy || workflowLocked} style={[styles.primaryButton, styles.flexButton, (gpsBusy || workflowLocked) && styles.disabled]} onPress={() => void checkGps()}>{gpsBusy ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="locate-outline" size={17} color={colors.white} /><Text style={styles.primaryButtonText}>Verify GPS</Text></>}</Pressable></View>{gpsLocked ? <View style={[styles.lockedCard, styles.gpsLockedCard]}><Ionicons name="lock-closed" size={18} color={colors.amber} /><Text style={[styles.lockedText, { color: colors.amber }]}>Data entry, evidence and autosave unlock after GPS verification.</Text></View> : null}<View style={styles.stepRow}>{sections.map((item, index) => <Pressable key={item.title} onPress={() => setSectionIndex(index)} style={[styles.step, index === sectionIndex && styles.stepActive]}><Text style={[styles.stepText, index === sectionIndex && styles.stepTextActive]}>{index + 1}</Text></Pressable>)}</View>{section ? <View style={styles.formCard}><Text style={styles.formTitle}>{section.title}</Text>{section.fields.map((field, index) => <View key={field.key}>{field.group && section.fields[index - 1]?.group !== field.group ? <Text style={styles.fieldGroup}>{field.group}</Text> : null}<FormInput field={field} value={values[field.key] ?? ""} locked={formLocked || Boolean(field.assigned)} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} /></View>)}</View> : null}<View style={styles.actionRow}>{sectionIndex > 0 ? <Pressable style={styles.outlineButton} onPress={() => setSectionIndex((current) => current - 1)}><Text style={styles.outlineButtonText}>Previous</Text></Pressable> : <View />}{sectionIndex < sections.length - 1 ? <Pressable style={[styles.primaryButton, styles.flexButton]} onPress={() => setSectionIndex((current) => current + 1)}><Text style={styles.primaryButtonText}>Next section</Text><Ionicons name="arrow-forward" size={16} color={colors.white} /></Pressable> : null}</View><View style={styles.formCard}><Text style={styles.formTitle}>Evidence</Text><Text style={styles.sectionSubtitle}>Photos and videos carry project, GPS, time, officer, device, network and SHA-256 integrity metadata.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceRow}>{live.report?.evidence.map((item) => <View key={item.id} style={styles.evidenceItem}>{item.type === "photo" ? <Image source={{ uri: item.uri }} style={styles.evidenceImage} /> : <View style={styles.videoEvidence}><Ionicons name="videocam" size={32} color={colors.white} /><Text style={styles.videoEvidenceText}>VIDEO EVIDENCE</Text></View>}<View style={styles.evidenceStamp}><Text style={styles.evidenceStampText}>{live.id} · {item.type.toUpperCase()}</Text><Text style={styles.evidenceStampText}>{new Date(item.capturedAt).toLocaleString()}</Text></View></View>)}{!formLocked ? <><Pressable onPress={() => void captureEvidence("photo")} style={styles.captureButton}><Ionicons name="camera-outline" size={27} color={colors.primary} /><Text style={styles.captureText}>Photo</Text></Pressable><Pressable onPress={() => void captureEvidence("video")} style={[styles.captureButton, styles.videoCaptureButton]}><Ionicons name="videocam-outline" size={27} color={colors.blue} /><Text style={[styles.captureText, { color: colors.blue }]}>Video</Text></Pressable></> : null}</ScrollView></View><View style={styles.formCard}><Text style={styles.formTitle}>Representative signatories</Text><FormInput field={{ key: "communitySignatory", label: "Community representative" }} value={communitySignatory} locked={formLocked} onChange={setCommunitySignatory} /><FormInput field={{ key: "contractorSignatory", label: "Contractor representative" }} value={contractorSignatory} locked={formLocked} onChange={setContractorSignatory} /></View>{workflowLocked ? <View style={styles.lockedCard}><Ionicons name="lock-closed" size={18} color={colors.primary} /><Text style={styles.lockedText}>This submitted inspection is locked and cannot be modified.</Text></View> : <View style={styles.submitRow}><Pressable disabled={gpsLocked} style={[styles.outlineButton, gpsLocked && styles.disabled]} onPress={() => { const result = saveDraft(live.id, values, communitySignatory, contractorSignatory); Alert.alert(result.ok ? "Draft saved" : "Draft locked", result.message); }}><Ionicons name="save-outline" size={17} color={colors.primary} /><Text style={styles.outlineButtonText}>Save draft</Text></Pressable><Pressable disabled={gpsLocked} style={[styles.primaryButton, styles.flexButton, gpsLocked && styles.disabled]} onPress={() => void submit()}><Ionicons name="send-outline" size={17} color={colors.white} /><Text style={styles.primaryButtonText}>Submit for review</Text></Pressable></View>}</ScrollView></SafeAreaView>
    </Modal>
  );
}

function FormInput({ field, value, locked, onChange }: { field: FormField; value: string; locked: boolean; onChange: (value: string) => void }) {
  return <FieldLabel label={field.label}>{field.options ? <View style={[styles.pickerWrap, locked && styles.readonlyInput]}><Picker selectedValue={value} enabled={!locked} onValueChange={(next) => onChange(String(next))} style={styles.picker} dropdownIconColor={colors.primary}><Picker.Item label={`Select ${field.label.toLowerCase()}`} value="" color={colors.slate} />{field.options.map((option) => <Picker.Item key={option} label={option} value={option} />)}</Picker></View> : <TextInput editable={!locked} value={value} onChangeText={onChange} keyboardType={field.keyboard ?? "default"} style={[styles.input, locked && styles.readonlyInput]} placeholder={locked ? "" : `Enter ${field.label.toLowerCase()}`} placeholderTextColor="#a0aaa4" />}</FieldLabel>;
}

function AssignmentCard({ item, onOpen, compact = false }: { item: Assignment; onOpen: (item: Assignment) => void; compact?: boolean }) {
  const status = displayStatus(item.status);
  return <Pressable onPress={() => onOpen(item)} style={[styles.assignmentCard, compact && styles.assignmentCardCompact]}><View style={styles.assignmentTop}><View style={styles.projectIcon}><Ionicons name="grid-outline" size={20} color={colors.primary} /></View><View style={styles.assignmentMain}><Text style={styles.assignmentName}>{item.projectName}</Text><Text style={styles.assignmentId}>{item.id} · {item.component}</Text></View>{compact ? <Text style={styles.dueText}>{formatDate(item.dueDate)}</Text> : <StatusBadge status={status} />}<Ionicons name="chevron-forward" size={17} color={colors.slate} /></View>{compact ? null : <><View style={styles.locationRow}><Ionicons name="location-outline" size={15} color={colors.muted} /><Text style={styles.assignmentLocation}>{item.community}, {item.lga}, {item.state}</Text></View><View style={styles.assignmentFooter}><Text style={styles.dueText}>Due {formatDate(item.dueDate)}</Text><Text style={styles.openLinkText}>{isReportLocked(item.status) ? "View report" : item.status === "Draft" ? "Continue form" : item.status === "Re-inspection" ? "Start again" : "Open"}</Text></View></>}</Pressable>;
}

function Metric({ label, value, note, icon, tone, onPress }: { label: string; value: number; note: string; icon: keyof typeof Ionicons.glyphMap; tone: "green" | "amber" | "blue" | "violet"; onPress: () => void }) {
  const color = tone === "amber" ? colors.amber : tone === "blue" ? colors.blue : tone === "violet" ? colors.violet : colors.primary;
  const pale = tone === "amber" ? colors.amberPale : tone === "blue" ? colors.bluePale : tone === "violet" ? colors.violetPale : colors.paleStrong;
  return <Pressable onPress={onPress} style={[styles.metricCard, { backgroundColor: pale }]}><View style={[styles.metricIcon, { backgroundColor: "rgba(255,255,255,0.66)" }]}><Ionicons name={icon} size={17} color={color} /></View><Text style={styles.metricValue}>{String(value)}</Text><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricNote}>{note}</Text><View style={[styles.metricLine, { backgroundColor: color }]} /></Pressable>;
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; tone: "green" | "amber" | "blue" }) {
  const color = tone === "amber" ? colors.amber : tone === "blue" ? colors.blue : colors.primary;
  const pale = tone === "amber" ? colors.amberPale : tone === "blue" ? colors.bluePale : colors.paleStrong;
  return <View style={[styles.summaryCard, { backgroundColor: pale }]}><Ionicons name={icon} size={20} color={color} /><Text style={styles.summaryValue}>{String(value)}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function MetricMini({ label, value, icon, color }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return <View style={styles.metricMini}><Ionicons name={icon} size={20} color={color} /><Text style={styles.metricMiniValue}>{value}</Text><Text style={styles.metricMiniLabel}>{label}</Text></View>;
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const tone = status === "Verified" || status === "Approved" ? colors.primary : status === "Draft" || status === "Submitted" ? colors.blue : colors.amber;
  const background = status === "Verified" || status === "Approved" ? colors.paleStrong : status === "Draft" || status === "Submitted" ? colors.bluePale : colors.amberPale;
  return <View style={[styles.badge, { backgroundColor: background }]}><View style={[styles.badgeDot, { backgroundColor: tone }]} /><Text style={[styles.badgeText, { color: tone }]}>{status}</Text></View>;
}

function FilterChip({ label, active, disabled = false, onPress }: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.chip, active && styles.chipActive, disabled && styles.disabled]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={styles.meta}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>;
}

function EmptyState({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return <View style={styles.empty}><Ionicons name={icon} size={36} color={colors.slate} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

function openMaps(item: Assignment) {
  void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function timeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 28, gap: 14 },
  listContent: { gap: 9 },
  header: { height: 70, backgroundColor: "rgba(255,255,255,0.94)", borderBottomWidth: 1, borderBottomColor: "rgba(223,233,226,0.75)", paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white },
  headerTitle: { color: colors.deep, fontSize: 17, lineHeight: 18, fontWeight: "800", letterSpacing: 0.2 },
  headerSubtitle: { color: colors.primary, fontSize: 8, fontWeight: "800", letterSpacing: 1.3 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  onlinePill: { flexDirection: "row", alignItems: "center", gap: 5 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  onlineBar: { height: 30, paddingHorizontal: 16, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", gap: 7 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryBright },
  offlineDot: { backgroundColor: colors.amber },
  onlineText: { color: colors.primary, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  heroCopy: { marginTop: 14, marginBottom: 6 },
  greetingBanner: { height: greetingBannerSpec.height, marginTop: 8, borderRadius: 17, backgroundColor: "#EAF8EF", borderWidth: 1, borderColor: "#D8EDDF", overflow: "hidden" },
  greetingArtwork: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  greetingArtworkImage: { position: "absolute", right: 0, top: 0, width: 438, height: greetingBannerSpec.height },
  greetingLeftTint: { position: "absolute", left: 0, top: 0, bottom: 0, width: "62%", backgroundColor: "#EAF8EF" },
  greetingContent: { width: "72%", height: "100%", paddingHorizontal: 12, paddingVertical: 10, justifyContent: "space-between" },
  greetingTopRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  sunBadge: { width: 37, height: 37, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)" },
  greetingIdentity: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 17, lineHeight: 20, color: colors.deep, fontWeight: "800", letterSpacing: -0.4 },
  greetingFirm: { color: colors.deep, fontSize: 9.5, lineHeight: 13, fontWeight: "700", marginTop: 1 },
  greetingMetaRow: { height: 20, marginLeft: 43, flexDirection: "row", alignItems: "center", gap: 4 },
  greetingLocation: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 },
  greetingLocationText: { flex: 1, color: colors.deep, fontSize: 8.5, fontWeight: "700" },
  greetingDivider: { width: 1, height: 14, backgroundColor: "rgba(18,60,43,0.18)", marginHorizontal: 2 },
  greetingWeatherText: { color: colors.deep, fontSize: 7.5, fontWeight: "700" },
  pageTitle: { fontSize: 28, lineHeight: 34, color: colors.deep, fontWeight: "800", letterSpacing: -0.7 },
  pageSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  metricsRow: { flexDirection: "row", gap: 9 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metricCard: { width: "48%", height: 108, borderRadius: 18, padding: 11, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  metricIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  metricValue: { marginTop: 6, color: colors.deep, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", textAlign: "center" },
  metricNote: { color: colors.muted, fontSize: 8, marginTop: 3, textAlign: "center" },
  metricLine: { position: "absolute", left: 13, right: 13, bottom: 8, height: 3, borderRadius: 2 },
  nextCard: { backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 24, padding: 17, gap: 12, shadowColor: "#214C38", shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4, overflow: "hidden" },
  listPanel: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 24, padding: 15, gap: 9, shadowColor: "#214C38", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderColor: "#edf1ee" },
  recentTitle: { color: colors.deep, fontSize: 12.5, fontWeight: "700" },
  recentEnd: { alignItems: "flex-end", gap: 4 },
  recentTime: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  eyebrow: { color: colors.primary, fontSize: 9, letterSpacing: 1.3, fontWeight: "800", marginBottom: 4 },
  cardTitle: { maxWidth: 235, fontSize: 15, lineHeight: 20, color: colors.deep, fontWeight: "800" },
  sectionTitle: { color: colors.deep, fontSize: 14, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3, lineHeight: 15 },
  viewAllButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewAll: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  listLabel: { color: colors.deep, fontSize: 13, fontWeight: "800", marginTop: 5 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { color: colors.deep, fontSize: 12, flex: 1 },
  metaRow: { flexDirection: "row", paddingVertical: 9, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#edf1ee" },
  meta: { flex: 1 },
  metaLabel: { color: colors.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" },
  metaValue: { marginTop: 3, color: colors.deep, fontSize: 11, fontWeight: "700" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  primaryButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  primaryButtonText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  flexButton: { flex: 1 },
  outlineButton: { minHeight: 46, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "#B9D7C4", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.82)" },
  outlineButtonText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  assignmentCard: { backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: "rgba(223,233,226,0.9)", borderRadius: 16, padding: 12, gap: 8, marginBottom: 2 },
  assignmentCardCompact: { borderRadius: 14, paddingVertical: 9, paddingHorizontal: 10, shadowColor: "#214C38", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  assignmentTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  projectIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
  assignmentMain: { flex: 1 },
  assignmentName: { color: colors.deep, fontSize: 13, lineHeight: 17, fontWeight: "800" },
  assignmentId: { color: colors.muted, fontSize: 9, marginTop: 3 },
  assignmentLocation: { color: colors.muted, fontSize: 11, flex: 1 },
  assignmentFooter: { borderTopWidth: 1, borderColor: "#edf1ee", paddingTop: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dueText: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  openLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  openLinkText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, height: 25, borderRadius: 13 },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: "800" },
  chipRow: { gap: 7, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: "#dbe5df", backgroundColor: colors.white, paddingHorizontal: 12, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.paleStrong },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: colors.primary },
  tabBar: { height: 70, marginHorizontal: 14, marginBottom: 10, padding: 7, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", borderRadius: 25, flexDirection: "row", shadowColor: "#173B2A", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 18 },
  tabIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.paleStrong },
  tabText: { color: colors.slate, fontSize: 8, fontWeight: "700" },
  tabTextActive: { color: colors.primary },
  empty: { padding: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 9, color: colors.deep, fontSize: 14, fontWeight: "800" },
  emptyText: { marginTop: 5, color: colors.muted, textAlign: "center", fontSize: 11, lineHeight: 17 },
  summaryStrip: { gap: 9, paddingVertical: 2 },
  summaryCard: { width: 112, height: 122, borderRadius: 21, padding: 14, justifyContent: "center" },
  summaryValue: { color: colors.deep, fontSize: 23, fontWeight: "800", marginTop: 8 },
  summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", marginTop: 2 },
  syncSummary: { flexDirection: "row", gap: 8 },
  syncBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bluePale, borderRadius: 18, padding: 14 },
  syncBannerIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.72)", alignItems: "center", justifyContent: "center" },
  syncBannerTitle: { color: colors.deep, fontSize: 13, fontWeight: "800" },
  syncBannerText: { color: colors.muted, fontSize: 10, marginTop: 2 },
  syncNowButton: { backgroundColor: colors.primary, paddingHorizontal: 14, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  syncNowButtonText: { color: colors.white, fontSize: 11, fontWeight: "800" },
  queueItemCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 14, padding: 11, borderWidth: 1, borderColor: "rgba(223,233,226,0.9)", shadowColor: "#214C38", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  syncStatusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  syncStatusText: { fontSize: 9, fontWeight: "800" },
  metricMini: { flex: 1, alignItems: "center", backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 20, paddingVertical: 15 },
  metricMiniValue: { color: colors.deep, fontSize: 20, fontWeight: "800", marginTop: 4 },
  metricMiniLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", marginTop: 2 },
  securityNote: { backgroundColor: colors.pale, borderRadius: 9, padding: 12, color: colors.muted, fontSize: 9, lineHeight: 15 },
  modalHeader: { height: 64, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.white },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.pale },
  modalTitleWrap: { flex: 1 },
  modalTitle: { color: colors.deep, fontSize: 13, fontWeight: "800" },
  modalSubtitle: { color: colors.muted, fontSize: 8, marginTop: 3 },
  inspectionContent: { padding: 15, paddingBottom: 40, gap: 12 },
  gpsCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 },
  gpsIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
  gpsCopy: { flex: 1 },
  gpsTitle: { color: colors.deep, fontSize: 13, fontWeight: "800" },
  gpsText: { color: colors.muted, fontSize: 9, marginTop: 4 },
  gpsMessage: { padding: 10, borderRadius: 8, color: colors.primary, backgroundColor: colors.paleStrong, fontSize: 10, fontWeight: "800" },
  gpsError: { color: colors.red, backgroundColor: colors.redPale },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginVertical: 2 },
  step: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#e7ede9", alignItems: "center", justifyContent: "center" },
  stepActive: { backgroundColor: colors.primary },
  stepText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  stepTextActive: { color: colors.white },
  formCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, gap: 2 },
  formTitle: { color: colors.deep, fontSize: 14, fontWeight: "800", marginBottom: 8 },
  fieldGroup: { marginTop: 13, marginBottom: 1, color: colors.primary, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  field: { marginTop: 8 },
  fieldLabel: { color: colors.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.55, fontWeight: "800", marginBottom: 6 },
  input: { height: 44, borderWidth: 1, borderColor: "#dbe5df", borderRadius: 8, backgroundColor: colors.white, paddingHorizontal: 12, color: colors.deep, fontSize: 12 },
  pickerWrap: { height: 48, borderWidth: 1, borderColor: "#dbe5df", borderRadius: 8, backgroundColor: colors.white, justifyContent: "center", overflow: "hidden" },
  picker: { color: colors.deep, fontSize: 12 },
  readonlyInput: { backgroundColor: "#f4f7f5", color: colors.muted },
  optionRow: { gap: 6 },
  evidenceRow: { gap: 9, paddingTop: 9 },
  evidenceItem: { width: 170, height: 132, borderRadius: 10, overflow: "hidden", backgroundColor: colors.pale },
  evidenceImage: { width: "100%", height: "100%" },
  evidenceStamp: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(8,61,35,0.78)", padding: 6 },
  evidenceStampText: { color: colors.white, fontSize: 7, fontWeight: "700" },
  captureButton: { width: 108, height: 132, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#8bcba0", backgroundColor: colors.pale, alignItems: "center", justifyContent: "center", gap: 5 },
  videoCaptureButton: { borderColor: "#91abd0", backgroundColor: colors.bluePale },
  captureText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  videoEvidence: { width: "100%", height: "100%", backgroundColor: colors.deep, alignItems: "center", justifyContent: "center", gap: 6 },
  videoEvidenceText: { color: colors.white, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  lockedCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, backgroundColor: colors.paleStrong, borderRadius: 9 },
  gpsLockedCard: { backgroundColor: colors.amberPale },
  lockedText: { flex: 1, color: colors.primary, fontSize: 10, fontWeight: "700" },
  submitRow: { flexDirection: "row", gap: 9 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,25,17,0.42)", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 72, paddingRight: 15 },
  backHeader: { height: 70, backgroundColor: "rgba(255,255,255,0.94)", borderBottomWidth: 1, borderBottomColor: "rgba(223,233,226,0.75)", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backHeaderTitle: { color: colors.deep, fontSize: 16, fontWeight: "800" },
  profileHero: { alignItems: "center", marginTop: 10, marginBottom: 6, gap: 3 },
  profileHeroAvatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  profileHeroAvatarText: { color: colors.primary, fontWeight: "800", fontSize: 26 },
  profileHeroName: { color: colors.deep, fontSize: 19, fontWeight: "800" },
  profileHeroRole: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  profileHeroFirm: { color: colors.muted, fontSize: 12 },
  profileStatusPill: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#edf1ee" },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
  menuInfo: { flex: 1 },
  menuLabel: { color: colors.deep, fontSize: 13, fontWeight: "700" },
  menuValue: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 14, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: colors.border },
  searchPlaceholder: { color: colors.slate, fontSize: 12 },
  helpRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#edf1ee" },
  helpIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.paleStrong, alignItems: "center", justifyContent: "center" },
  helpText: { color: colors.muted, fontSize: 10, marginTop: 2 },
  logoutRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 14, backgroundColor: colors.redPale, marginTop: 4 },
  logoutText: { color: colors.red, fontSize: 13, fontWeight: "800" },
  loginSafe: { flex: 1, backgroundColor: colors.pale },
  loginWrap: { flex: 1, paddingHorizontal: 22, justifyContent: "center", alignItems: "center" },
  brandMark: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.white },
  loginBrand: { color: colors.deep, fontSize: 25, fontWeight: "900", letterSpacing: 3, marginTop: 14 },
  loginAgency: { color: colors.primary, fontSize: 8, fontWeight: "800", letterSpacing: 1.2, marginTop: 3 },
  loginCard: { alignSelf: "stretch", marginTop: 28, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18 },
  loginTitle: { color: colors.deep, fontSize: 19, fontWeight: "800" },
  loginSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 5, marginBottom: 8 },
  errorText: { color: colors.red, fontSize: 10, fontWeight: "700", marginVertical: 8 },
});

export default function App() {
  return <StoreProvider><AppRoot /></StoreProvider>;
}
