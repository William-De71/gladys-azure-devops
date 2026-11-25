// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene summaries,
// messages of the Configuration screen. Vocabulary of the Gladys interface:
// appareil / Gerät / dispositivo, scène / Szene / escena.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  projectDeviceName: {
    en: 'Azure DevOps {project}',
    fr: 'Azure DevOps {project}',
    de: 'Azure DevOps {project}',
    es: 'Azure DevOps {project}',
  },
  featureActivePullRequests: {
    en: 'Active pull requests',
    fr: 'Pull requests actives',
    de: 'Aktive Pull Requests',
    es: 'Pull requests activas',
  },
  featureToReview: {
    en: 'Pull requests to review',
    fr: 'Pull requests à relire',
    de: 'Zu prüfende Pull Requests',
    es: 'Pull requests por revisar',
  },
  featureMyWorkItems: {
    en: 'My work items',
    fr: 'Mes éléments de travail',
    de: 'Meine Arbeitselemente',
    es: 'Mis elementos de trabajo',
  },
  featureFailedPipelines: {
    en: 'Failed pipelines',
    fr: 'Pipelines en échec',
    de: 'Fehlgeschlagene Pipelines',
    es: 'Pipelines fallidas',
  },
  featureRunningBuilds: {
    en: 'Running builds',
    fr: 'Builds en cours',
    de: 'Laufende Builds',
    es: 'Builds en curso',
  },
  featureLastBuild: {
    en: 'Last run',
    fr: 'Dernière exécution',
    de: 'Letzte Ausführung',
    es: 'Última ejecución',
  },
  featureLatestPullRequest: {
    en: 'Latest pull request',
    fr: 'Dernière pull request',
    de: 'Neuester Pull Request',
    es: 'Última pull request',
  },
  result_succeeded: {
    en: 'Succeeded',
    fr: 'Réussi',
    de: 'Erfolgreich',
    es: 'Correcto',
  },
  result_partiallySucceeded: {
    en: 'Partial success',
    fr: 'Succès partiel',
    de: 'Teilerfolg',
    es: 'Éxito parcial',
  },
  result_failed: {
    en: 'Failed',
    fr: 'Échec',
    de: 'Fehlgeschlagen',
    es: 'Fallido',
  },
  result_canceled: {
    en: 'Canceled',
    fr: 'Annulé',
    de: 'Abgebrochen',
    es: 'Cancelado',
  },
  summaryBuild_succeeded: {
    en: '{pipeline} #{number} succeeded on {branch} ({project}).',
    fr: '{pipeline} n° {number} a réussi sur {branch} ({project}).',
    de: '{pipeline} #{number} war erfolgreich auf {branch} ({project}).',
    es: '{pipeline} n.º {number} se completó correctamente en {branch} ({project}).',
  },
  summaryBuild_partiallySucceeded: {
    en: '{pipeline} #{number} partially succeeded on {branch} ({project}).',
    fr: '{pipeline} n° {number} a réussi en partie sur {branch} ({project}).',
    de: '{pipeline} #{number} war teilweise erfolgreich auf {branch} ({project}).',
    es: '{pipeline} n.º {number} se completó en parte en {branch} ({project}).',
  },
  summaryBuild_failed: {
    en: '{pipeline} #{number} failed on {branch} ({project}).',
    fr: '{pipeline} n° {number} a échoué sur {branch} ({project}).',
    de: '{pipeline} #{number} ist auf {branch} fehlgeschlagen ({project}).',
    es: '{pipeline} n.º {number} ha fallado en {branch} ({project}).',
  },
  summaryBuild_canceled: {
    en: '{pipeline} #{number} was canceled on {branch} ({project}).',
    fr: '{pipeline} n° {number} a été annulé sur {branch} ({project}).',
    de: '{pipeline} #{number} wurde auf {branch} abgebrochen ({project}).',
    es: '{pipeline} n.º {number} se ha cancelado en {branch} ({project}).',
  },
  summaryPullRequestCreated: {
    en: 'New pull request in {project}: !{number} {title}, by {author}.',
    fr: 'Nouvelle pull request dans {project} : !{number} {title}, par {author}.',
    de: 'Neuer Pull Request in {project}: !{number} {title}, von {author}.',
    es: 'Nueva pull request en {project}: !{number} {title}, de {author}.',
  },
  summaryReviewRequested: {
    en: 'Your review is requested in {project}: !{number} {title}, by {author}.',
    fr: 'Votre relecture est demandée dans {project} : !{number} {title}, par {author}.',
    de: 'Dein Review wird in {project} erwartet: !{number} {title}, von {author}.',
    es: 'Se solicita su revisión en {project}: !{number} {title}, de {author}.',
  },
  summaryPullRequestCompleted: {
    en: 'Pull request !{number} {title} completed into {target} ({project}).',
    fr: 'Pull request !{number} {title} terminée dans {target} ({project}).',
    de: 'Pull Request !{number} {title} in {target} abgeschlossen ({project}).',
    es: 'Pull request !{number} {title} completada en {target} ({project}).',
  },
  summaryWorkItem: {
    en: '{type} #{number} assigned to you in {project}: {title}.',
    fr: '{type} n° {number} vous est assigné dans {project} : {title}.',
    de: '{type} #{number} wurde dir in {project} zugewiesen: {title}.',
    es: '{type} n.º {number} se le ha asignado en {project}: {title}.',
  },
  summaryProject: {
    en: '{project}: {reviews} pull request(s) to review, {items} work item(s), {failed} failed pipeline(s).',
    fr: '{project} : {reviews} pull request(s) à relire, {items} élément(s) de travail, {failed} pipeline(s) en échec.',
    de: '{project}: {reviews} Pull Request(s) zu prüfen, {items} Arbeitselement(e), {failed} fehlgeschlagene Pipeline(s).',
    es: '{project}: {reviews} pull request(s) por revisar, {items} elemento(s) de trabajo, {failed} pipeline(s) fallida(s).',
  },
  summaryRun: {
    en: 'Run {number} of {pipeline} queued on {branch} ({project}).',
    fr: 'Exécution {number} de {pipeline} mise en file sur {branch} ({project}).',
    de: 'Ausführung {number} von {pipeline} auf {branch} eingereiht ({project}).',
    es: 'Ejecución {number} de {pipeline} en cola en {branch} ({project}).',
  },
  allProjects: {
    en: 'All projects ({count})',
    fr: 'Tous les projets ({count})',
    de: 'Alle Projekte ({count})',
    es: 'Todos los proyectos ({count})',
  },
  toReview: {
    en: 'To review',
    fr: 'À relire',
    de: 'Zu prüfen',
    es: 'Por revisar',
  },
  myWorkItems: {
    en: 'My work items',
    fr: 'Mes éléments',
    de: 'Meine Elemente',
    es: 'Mis elementos',
  },
  failedPipelines: {
    en: 'Failed',
    fr: 'En échec',
    de: 'Fehlgeschlagen',
    es: 'Fallidas',
  },
  runningBuilds: {
    en: 'Running',
    fr: 'En cours',
    de: 'Laufend',
    es: 'En curso',
  },
  lastRun: {
    en: 'Last run: {pipeline}',
    fr: 'Dernière : {pipeline}',
    de: 'Zuletzt: {pipeline}',
    es: 'Última: {pipeline}',
  },
  openAzureDevOps: {
    en: 'Open Azure DevOps',
    fr: 'Ouvrir Azure DevOps',
    de: 'Azure DevOps öffnen',
    es: 'Abrir Azure DevOps',
  },
  running: {
    en: 'Running',
    fr: 'En cours',
    de: 'Läuft',
    es: 'En curso',
  },
  noBuildAccess: {
    en: 'The token cannot read the pipelines: give it the Build (Read) scope.',
    fr: 'Le jeton ne peut pas lire les pipelines : donnez-lui l’étendue Build (Read).',
    de: 'Das Token kann die Pipelines nicht lesen: gib ihm den Bereich Build (Read).',
    es: 'El token no puede leer las pipelines: concédale el ámbito Build (Read).',
  },
  noPipeline: {
    en: 'No pipeline has run in this project yet.',
    fr: 'Aucun pipeline n’a encore tourné dans ce projet.',
    de: 'In diesem Projekt ist noch keine Pipeline gelaufen.',
    es: 'Todavía no se ha ejecutado ninguna pipeline en este proyecto.',
  },
  badgeDraft: {
    en: 'Draft',
    fr: 'Brouillon',
    de: 'Entwurf',
    es: 'Borrador',
  },
  badgeRejected: {
    en: 'Rejected',
    fr: 'Refusée',
    de: 'Abgelehnt',
    es: 'Rechazada',
  },
  badgeToReview: {
    en: 'To review',
    fr: 'À relire',
    de: 'Zu prüfen',
    es: 'Por revisar',
  },
  badgeWaiting: {
    en: 'Awaiting author',
    fr: 'Attente auteur',
    de: 'Wartet auf Autor',
    es: 'Espera al autor',
  },
  badgeApproved: {
    en: 'Approved ({n})',
    fr: 'Approuvée ({n})',
    de: 'Genehmigt ({n})',
    es: 'Aprobada ({n})',
  },
  badgeActive: {
    en: 'Active',
    fr: 'Active',
    de: 'Aktiv',
    es: 'Activa',
  },
  noCodeAccess: {
    en: 'The token cannot read the pull requests: give it the Code (Read) scope.',
    fr: 'Le jeton ne peut pas lire les pull requests : donnez-lui l’étendue Code (Read).',
    de: 'Das Token kann die Pull Requests nicht lesen: gib ihm den Bereich Code (Read).',
    es: 'El token no puede leer las pull requests: concédale el ámbito Code (Read).',
  },
  noPullRequest_all: {
    en: 'No active pull request.',
    fr: 'Aucune pull request active.',
    de: 'Kein aktiver Pull Request.',
    es: 'Ninguna pull request activa.',
  },
  noPullRequest_to_review: {
    en: 'Nothing to review.',
    fr: 'Rien à relire.',
    de: 'Nichts zu prüfen.',
    es: 'Nada por revisar.',
  },
  noPullRequest_mine: {
    en: 'None of your pull requests is active.',
    fr: 'Aucune de vos pull requests n’est active.',
    de: 'Keiner deiner Pull Requests ist aktiv.',
    es: 'Ninguna de sus pull requests está activa.',
  },
  pullRequestLine: {
    en: '{repository}: {source} → {target}, by {author}',
    fr: '{repository} : {source} → {target}, par {author}',
    de: '{repository}: {source} → {target}, von {author}',
    es: '{repository}: {source} → {target}, de {author}',
  },
  noWorkAccess: {
    en: 'The token cannot read the work items: give it the Work Items (Read) scope.',
    fr: 'Le jeton ne peut pas lire les éléments de travail : donnez-lui l’étendue Work Items (Read).',
    de: 'Das Token kann die Arbeitselemente nicht lesen: gib ihm den Bereich Work Items (Read).',
    es: 'El token no puede leer los elementos de trabajo: concédale el ámbito Work Items (Read).',
  },
  noWorkItem: {
    en: 'No open work item is assigned to you.',
    fr: 'Aucun élément de travail ouvert ne vous est assigné.',
    de: 'Dir ist kein offenes Arbeitselement zugewiesen.',
    es: 'No tiene ningún elemento de trabajo abierto asignado.',
  },
  ago_now: {
    en: 'just now',
    fr: 'à l’instant',
    de: 'gerade eben',
    es: 'ahora mismo',
  },
  ago_minutes: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  ago_hours: {
    en: '{n} h ago',
    fr: 'il y a {n} h',
    de: 'vor {n} Std.',
    es: 'hace {n} h',
  },
  ago_days: {
    en: '{n} d ago',
    fr: 'il y a {n} j',
    de: 'vor {n} T.',
    es: 'hace {n} d',
  },
  noOrganization: {
    en: 'Enter your Azure DevOps organization in the configuration.',
    fr: 'Saisissez votre organisation Azure DevOps dans la configuration.',
    de: 'Gib deine Azure-DevOps-Organisation in der Konfiguration ein.',
    es: 'Introduzca su organización de Azure DevOps en la configuración.',
  },
  noToken: {
    en: 'Enter a personal access token in the configuration.',
    fr: 'Saisissez un jeton d’accès personnel dans la configuration.',
    de: 'Gib ein persönliches Zugriffstoken in der Konfiguration ein.',
    es: 'Introduzca un token de acceso personal en la configuración.',
  },
  notReadYet: {
    en: 'Azure DevOps has not been read yet.',
    fr: 'Azure DevOps n’a pas encore été lu.',
    de: 'Azure DevOps wurde noch nicht gelesen.',
    es: 'Azure DevOps aún no se ha leído.',
  },
  noProject: {
    en: 'No project is followed: check the Projects field.',
    fr: 'Aucun projet suivi : vérifiez le champ Projets.',
    de: 'Kein Projekt wird verfolgt: prüfe das Feld Projekte.',
    es: 'No se sigue ningún proyecto: compruebe el campo Proyectos.',
  },
  statusConnected: {
    en: 'Connected as {user} to {organization}, {count} project(s) followed.',
    fr: 'Connecté en tant que {user} à {organization}, {count} projet(s) suivi(s).',
    de: 'Als {user} mit {organization} verbunden, {count} Projekt(e) verfolgt.',
    es: 'Conectado como {user} a {organization}, {count} proyecto(s) seguido(s).',
  },
  statusMissing: {
    en: 'Not found: {missing}.',
    fr: 'Introuvables : {missing}.',
    de: 'Nicht gefunden: {missing}.',
    es: 'No encontrados: {missing}.',
  },
  statusRefused: {
    en: 'Scopes missing on the token: {scopes}.',
    fr: 'Étendues absentes du jeton : {scopes}.',
    de: 'Fehlende Bereiche im Token: {scopes}.',
    es: 'Ámbitos que faltan en el token: {scopes}.',
  },
  scope_build: {
    en: 'Build (Read)',
    fr: 'Build (Read)',
    de: 'Build (Read)',
    es: 'Build (Read)',
  },
  scope_code: {
    en: 'Code (Read)',
    fr: 'Code (Read)',
    de: 'Code (Read)',
    es: 'Code (Read)',
  },
  scope_work: {
    en: 'Work Items (Read)',
    fr: 'Work Items (Read)',
    de: 'Work Items (Read)',
    es: 'Work Items (Read)',
  },
  statusInvalidToken: {
    en: 'Azure DevOps refused the token: it is wrong, expired, revoked, or not valid for this organization.',
    fr: 'Azure DevOps a refusé le jeton : il est faux, expiré, révoqué ou pas valable pour cette organisation.',
    de: 'Azure DevOps hat das Token abgelehnt: falsch, abgelaufen, widerrufen oder nicht für diese Organisation gültig.',
    es: 'Azure DevOps rechazó el token: es incorrecto, ha caducado, se ha revocado o no vale para esta organización.',
  },
  statusNoProjectScope: {
    en: 'The token cannot list the projects: give it the Project and Team (Read) scope.',
    fr: 'Le jeton ne peut pas lister les projets : donnez-lui l’étendue Project and Team (Read).',
    de: 'Das Token kann die Projekte nicht auflisten: gib ihm den Bereich Project and Team (Read).',
    es: 'El token no puede listar los proyectos: concédale el ámbito Project and Team (Read).',
  },
  statusUnknownOrganization: {
    en: 'No Azure DevOps organization at {url}: check the Organization field.',
    fr: 'Aucune organisation Azure DevOps à {url} : vérifiez le champ Organisation.',
    de: 'Keine Azure-DevOps-Organisation unter {url}: prüfe das Feld Organisation.',
    es: 'No hay ninguna organización de Azure DevOps en {url}: compruebe el campo Organización.',
  },
  statusForbidden: {
    en: 'Azure DevOps answered 403: the token is not allowed to read this organization.',
    fr: 'Azure DevOps a répondu 403 : le jeton n’a pas le droit de lire cette organisation.',
    de: 'Azure DevOps antwortete 403: das Token darf diese Organisation nicht lesen.',
    es: 'Azure DevOps respondió 403: el token no puede leer esta organización.',
  },
  statusRateLimited: {
    en: 'Azure DevOps asks to slow down: the next reading waits.',
    fr: 'Azure DevOps demande de ralentir : la prochaine lecture attend.',
    de: 'Azure DevOps bittet um weniger Anfragen: die nächste Abfrage wartet.',
    es: 'Azure DevOps pide reducir el ritmo: la próxima lectura espera.',
  },
  statusUnreachable: {
    en: 'Azure DevOps is unreachable for now: new try at the next reading.',
    fr: 'Azure DevOps est injoignable pour l’instant : nouvel essai à la prochaine lecture.',
    de: 'Azure DevOps ist gerade nicht erreichbar: neuer Versuch bei der nächsten Abfrage.',
    es: 'Azure DevOps no está accesible por ahora: nuevo intento en la próxima lectura.',
  },
  testOk: {
    en: 'Token accepted for {user} on {organization}: {count} project(s) read out of {total}.',
    fr: 'Jeton accepté pour {user} sur {organization} : {count} projet(s) lu(s) sur {total}.',
    de: 'Token für {user} auf {organization} akzeptiert: {count} von {total} Projekt(en) gelesen.',
    es: 'Token aceptado para {user} en {organization}: {count} proyecto(s) leído(s) de {total}.',
  },
};

/**
 * @description Whether a value is one of the supported languages.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de or es.
 * @example
 * isLanguage('fr'); // -> true
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('summaryWorkItem', 'fr', { type: 'Bug', number: 12, title: 'Crash', project: 'Web' });
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('statusConnected', { user: 'Ada', organization: 'contoso', count: 2 });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago };
