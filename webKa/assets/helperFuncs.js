

module.exports = {
    parsePath: function(pathString){
        console.log('be',pathString);
        return pathString.split('/');
    }
};