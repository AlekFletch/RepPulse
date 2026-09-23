import router from '@system.router';

export default {
    data: {},
    openDiagnostics() {
        router.replace({ uri: 'pages/diagnostics/diagnostics' });
    }
};
