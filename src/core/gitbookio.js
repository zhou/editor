define([
    "hr/utils",
    "core/settings",
    "utils/loading",
    "utils/dialogs",
    "utils/analytic",
    "text!resources/templates/dialogs/login.html"
], function(_, settings, loading, dialogs, analytic, templateLogin) {
    var GitBook = node.require("gitbook-api");
    var client = new GitBook();
    var gui = node.gui;

    var setConfig = function() {
        // Update analytic settings
        analytic.setDistinctId(settings.get("username"));

        // update api settings
        var config = {
            host: settings.get("host") || "https://www.gitbook.io",
            auth: null
        };

        if (settings.get("username") && settings.get("token")) {
            config.auth = {
                username: settings.get("username") || "",
                password: settings.get("token") || ""
            };
        }

        client.config = config;
        client.updateConfig();
    };

    settings.on("set", setConfig);
    setConfig();

    /* Dialog to connect an account */
    var connectAccount = function() {
        if (settings.get("username") && settings.get("token")) {
            return dialogs.confirm("Disconnect your account", "Do you really want to unlink this computer with your GitBook account?")
            .then(function() {
                analytic.track("account.disconnect");
                settings.set("username", null);
                settings.set("token", null);
                settings.setStateToStorage();
            });
        }

        return dialogs.open(null, {
            "dialog": "login",
            "valueSelector": function(diag) {
                return {
                    username: diag.$(".login-username").val(),
                    password: diag.$(".login-password").val()
                }
            }
        })
        .then(function(auth) {
            return loading.show(client.login(auth.username, auth.password), "Connecting to your account ...");
        })
        .then(function(account) {
            settings.set("token", client.config.auth.password, { silent: true });
            settings.set("username", client.config.auth.username);
            settings.setStateToStorage();

            analytic.track("account.connect");
        })
        .then(function() {
            dialogs.alert("Account connected",
                "Your GitBook account is now connected to this computer. "
                + "You can disconnect it by clicking on your username on the 'Preference' menu.");
        }, dialogs.error)
    };

    /* Publish a book */
    var publishBook = function(toPublish) {
        var books, book;

        if (!client.config.auth || !client.config.auth.username || !client.config.auth.password) {
            return connectAccount()
            .then(function() {
                return publishBook(toPublish);
            });
        }

        return loading.show(client.books(), "Listing books ...")
        .then(function(_books) {
            books = _books;

            return dialogs.fields("Publish this book", {
                book: {
                    label: "Book",
                    type: "select",
                    options: _.chain(books)
                        .map(function(book) {
                            return [
                                book.id,
                                book.id
                            ]
                        })
                        .object()
                        .value()
                },
                version: {
                    label: "Version",
                    type: "text"
                },
            }, {});
        })
        .then(function(build) {
            book =_.find(books, function(_book) {
                return _book.id == build.book;
            });
            if (!build.version) throw "Need a version";

            analytic.track("publish");
            return loading.show(book.publishFolder(build.version, toPublish.root()), "Publishing new version ...");
        })
        .then(function() {
            var link = client.config.host+"/book/"+book.id+"/activity";
            return dialogs.confirm("Do you want to see your build status?", "Your build just started, you can follow the process on the activity tab on your book.")
            .then(function() {
                gui.Shell.openExternal(link);
            });
        }, function(err) {
            if (err.error) err = new Error(err.error);
            return dialogs.error(err);
        });
    };

    return {
        api: client,
        connectAccount: connectAccount,
        publishBook: publishBook
    };
});