<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        <img class="bpm-account-mark" src="${url.resourcesPath}/img/bpm-logo-official.png" alt="BPM Portal" />
        <span class="bpm-login-title">Welcome back</span>
        <span class="bpm-login-subtitle">Sign in to continue to your BPM workspace</span>
    <#elseif section = "form">
        <section class="bpm-hero-copy" aria-label="BPM Main Portal">
            <div class="bpm-brand"><img class="bpm-brand-mark" src="${url.resourcesPath}/img/bpm-logo-official.png" alt="BPM Portal" /><strong>BPM</strong> Main Portal</div>
            <h2>Orchestrate. <em>Automate.</em> Optimize.</h2>
            <p>Streamline your business processes, collaborate seamlessly, and drive operational excellence across your organization.</p>
            <div class="bpm-security-note">
                <span class="bpm-shield" aria-hidden="true"></span>
                <span><strong>Enterprise-grade security</strong><small>Your data is protected with industry-leading security and compliance.</small></span>
            </div>
        </section>
        <div id="kc-form">
          <div id="kc-form-wrapper">
            <#if realm.password>
                <form id="kc-form-login" action="${url.loginAction}" method="post"
                      onsubmit="if (this.classList.contains('is-submitting')) return false; this.classList.add('is-submitting'); this.login.disabled = true; this.login.value = 'Signing in...'; return true;">
                    <#if !usernameHidden??>
                        <div class="${properties.kcFormGroupClass!} bpm-field bpm-username-field">
                            <label for="username" class="bpm-sr-only"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></label>
                            <input tabindex="2" id="username" class="${properties.kcInputClass!}" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="username"
                                   placeholder="<#if !realm.loginWithEmailAllowed>${msg('username')}<#elseif !realm.registrationEmailAsUsername>${msg('usernameOrEmail')}<#else>${msg('email')}</#if>"
                                   aria-invalid="<#if messagesPerField.existsError('username','password')>true<#else>false</#if>"
                                   <#if messagesPerField.existsError('username','password')>aria-describedby="input-error"</#if> />
                            <#if messagesPerField.existsError('username','password')>
                                <span id="input-error" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                    ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                                </span>
                            </#if>
                        </div>
                    </#if>

                    <div class="${properties.kcFormGroupClass!} bpm-field bpm-password-field">
                        <label for="password" class="bpm-sr-only">${msg("password")}</label>
                        <div class="${properties.kcInputGroup!}">
                            <input tabindex="3" id="password" class="${properties.kcInputClass!}" name="password" type="password"
                                   autocomplete="current-password" placeholder="${msg('password')}"
                                   aria-invalid="<#if messagesPerField.existsError('username','password')>true<#else>false</#if>" />
                            <button class="${properties.kcFormPasswordVisibilityButtonClass!}" type="button" aria-label="${msg('showPassword')}"
                                    aria-controls="password" data-password-toggle tabindex="4"
                                    data-icon-show="${properties.kcFormPasswordVisibilityIconShow!}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!}"
                                    data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                <i class="${properties.kcFormPasswordVisibilityIconShow!}" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>

                    <div class="${properties.kcFormGroupClass!} ${properties.kcFormSettingClass!} bpm-form-options">
                        <div id="kc-form-options">
                            <#if realm.rememberMe && !usernameHidden??>
                                <label class="bpm-remember">
                                    <input tabindex="5" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>>
                                    <span>${msg("rememberMe")}</span>
                                </label>
                            </#if>
                        </div>
                        <div class="${properties.kcFormOptionsWrapperClass!}">
                            <#if realm.resetPasswordAllowed>
                                <a tabindex="6" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                            </#if>
                        </div>
                    </div>

                    <div id="kc-form-buttons" class="${properties.kcFormGroupClass!}">
                        <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                        <input tabindex="7" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                               name="login" id="kc-login" type="submit" value="${msg('doLogIn')}"/>
                    </div>
                </form>
            </#if>
          </div>
        </div>
        <script type="module" src="${url.resourcesPath}/js/brandFavicon.js"></script>
        <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
    <#elseif section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration-container"><div id="kc-registration">
                <span>${msg("noAccount")} <a tabindex="8" href="${url.registrationUrl}">${msg("doRegister")}</a></span>
            </div></div>
        </#if>
    <#elseif section = "socialProviders">
        <#if realm.password && social.providers??>
            <div id="kc-social-providers" class="${properties.kcFormSocialAccountSectionClass!}">
                <hr/><h2>${msg("identity-provider-login-label")}</h2>
                <ul class="${properties.kcFormSocialAccountListClass!}">
                    <#list social.providers as p>
                        <li><a id="social-${p.alias}" class="${properties.kcFormSocialAccountListButtonClass!}" href="${p.loginUrl}">
                            <#if p.iconClasses?has_content><i class="${properties.kcCommonLogoIdP!} ${p.iconClasses!}" aria-hidden="true"></i></#if>
                            <span class="${properties.kcFormSocialAccountNameClass!}">${p.displayName!}</span>
                        </a></li>
                    </#list>
                </ul>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
