pipeline {
    agent any

    environment {
        DOCKERHUB_CREDENTIALS = 'DockerHub'
        dockerhub_username = "constedocker"
        slack_tokens = 'new-token-slack' 
        slackSend_channel = '#myaux'
        slack_domain = 'le-constellationgroup'
        VAULT_CREDENTIALS = 'vault-token'
        DEBUG = 'true'
    }

    stages {
        stage('Init Variables') {
            steps {
                script {
                    def gitUrl = env.GIT_URL ?: sh(script: 'git config --get remote.origin.url', returnStdout: true).trim()
                    env.projectName = gitUrl.split('/').last().replace('.git', '').replaceAll('[^a-zA-Z0-9._-]', '-').toLowerCase()
                    env.sanitizedBranchName = env.BRANCH_NAME.replace(")", "").replaceAll('[^a-zA-Z0-9.-]', '_').toLowerCase()
                    env.image_name = "${env.projectName}_${env.sanitizedBranchName}"
                    env.DOCKER_TAG_NAME = "${env.image_name}:${env.BUILD_NUMBER}"
                }
            }
        }

        stage('Commiter') {
            steps {
                script {
                    def COMMITTER_EMAIL = isUnix()
                        ? sh(script: "git --no-pager show -s --format='%ae'", returnStdout: true).trim()
                        : bat(script: "git --no-pager show -s --format=%%ae", returnStdout: true).split('\r\n')[2].trim()

                    slackSend channel: "${slackSend_channel}", message: "(${JOB_NAME}) ${COMMITTER_EMAIL} a initiÃ© le build ${BUILD_DISPLAY_NAME}", teamDomain: "${slack_domain}", tokenCredentialId: "${slack_tokens}", botUser: 'true', color: 'good', iconEmoji: ':thumbsup:'
                }
            }
        }


         /* ================= CHOIX GLOBAL ================= */

        stage("Choisir le mode d'exÃ©cution") {
            steps {
                script {
                    env.MODE_EXECUTION = input(
                        message: 'Quel pipeline voulez-vous lancer ?',
                        parameters: [
                            choice(
                                name: 'MODE_EXECUTION',
                                choices: ['sonar', 'docker'],
                                description: 'sonar = Sonar + Trivy | docker = Build / Vault'
                            )
                        ]
                    )
                }
            }
        }

        /* ================= SONAR ================= */


        stage('SonarQube Analysis') {
            when {
                expression { env.MODE_EXECUTION == 'sonar' }
            }
            steps {
                script {
                    def scannerHome = tool 'SonarScaner'   // âœ… non du sonar sur tool jenkins

                    withSonarQubeEnv('Sonar-server') {
                        sh """
                        ${scannerHome}/bin/sonar-scanner \
                          -X \
                          -Dsonar.projectKey=${env.projectName}-${env.sanitizedBranchName}
                       
                        """
                    }
                }
            }
        }

        // stage('Quality Gate') {
        //     steps {
        //         timeout(time: 5, unit: 'MINUTES') {
        //             waitForQualityGate abortPipeline: true
        //         }
        //     }
        // }

        stage('Trivy Scan') {
            when {
                expression { env.MODE_EXECUTION == 'sonar' }
            }
            steps {
                sh """
                docker run --rm \
                  -v /var/run/docker.sock:/var/run/docker.sock \
                  -v \$PWD:/workspace \
                  aquasec/trivy:latest \
                  fs /workspace \
                  --severity HIGH,CRITICAL \
                  --scanners vuln \
                  --exit-code 1
                """
            }
        }

        stage('Login to Docker Hub') {
            when {
                expression { env.MODE_EXECUTION == 'docker' }
            }
            steps {
                withCredentials([usernamePassword(credentialsId: "${DOCKERHUB_CREDENTIALS}", usernameVariable: 'DOCKERHUB_CREDENTIALS_USR', passwordVariable: 'DOCKERHUB_CREDENTIALS_PSW')]) {
                    sh "echo $DOCKERHUB_CREDENTIALS_PSW | docker login -u $DOCKERHUB_CREDENTIALS_USR --password-stdin"
                }
            }
        }

        stage("Choisir l'action") {
            when {
                expression { env.MODE_EXECUTION == 'docker' }
            }
            steps {
                script {
                    env.CHOIX_ACTION = input(
                        id: 'choix_action_input',
                        message: 'Que voulez-vous faire ?',
                        parameters: [
                            choice(name: 'CHOIX_ACTION', choices: ['build', 'environment'], description: 'Choisissez lâ€™action Ã  effectuer')
                        ]
                    )
                }
            }
        }

        stage('Build image') {
            when {
                expression { env.MODE_EXECUTION == 'docker' && env.CHOIX_ACTION == 'build' }
            }
            steps {
                script {
                    def userInput = input(
                        id: 'UserInput',
                        message: 'Entrer l\'environnement (ex: prod)',
                        parameters: [
                            string(defaultValue: '', description: 'Nom de l\'environnement', name: 'ENV_NAME')
                        ]
                    )

                    if (userInput == "") {
                        env.image_name = "${env.image_name}"
                    } else if (userInput == "prod" || userInput == "prod") {
                        env.image_name = "${env.image_name}"
                    } 

                    sh "docker build --build-arg BUILD_NUMBER=${BUILD_NUMBER} -t ${dockerhub_username}/${env.image_name}:build_${BUILD_NUMBER} -t ${dockerhub_username}/${env.image_name} -f Dockerfile_${env.sanitizedBranchName} --no-cache ."
                }
            }
            post {
                success {
                    slackSend channel: "${slackSend_channel}", message: "(${JOB_NAME}) L'image ${DOCKER_TAG_NAME} a Ã©tÃ© buildÃ©e avec succÃ¨s !", teamDomain: "${slack_domain}", tokenCredentialId: "${slack_tokens}", botUser: 'true', color: 'good', iconEmoji: ':thumbsup:'
                }
                failure {
                    slackSend channel: "${slackSend_channel}", message: "(${JOB_NAME}) Le build de l'image ${DOCKER_TAG_NAME} a Ã©chouÃ© !", teamDomain: "${slack_domain}", tokenCredentialId: "${slack_tokens}", botUser: 'true', color: 'danger', iconEmoji: ':thumbsdown:'
                }
            }
        }

        stage('Push Image') {
            when {
                expression { env.MODE_EXECUTION == 'docker' && env.CHOIX_ACTION == 'build' }
            }
            steps {
                sh "docker push ${dockerhub_username}/${env.image_name}:build_${BUILD_NUMBER}"
                sh "docker push ${dockerhub_username}/${env.image_name}"
            }
            post {
                success {
                    slackSend channel: "${slackSend_channel}", message: "(${JOB_NAME}) L'image ${DOCKER_TAG_NAME} est disponible sur Docker Hub", teamDomain: "${slack_domain}", tokenCredentialId: "${slack_tokens}", botUser: 'true', color: 'good', iconEmoji: ':thumbsup:'
                }
                failure {
                    slackSend channel: "${slackSend_channel}", message: "(${JOB_NAME}) Le push de l'image ${DOCKER_TAG_NAME} a Ã©chouÃ© !", teamDomain: "${slack_domain}", tokenCredentialId: "${slack_tokens}", botUser: 'true', color: 'danger', iconEmoji: ':thumbsdown:'
                    retry(1) {
                        sh "docker push ${dockerhub_username}/${env.image_name}:build_${BUILD_NUMBER}"
                        sh "docker push ${dockerhub_username}/${env.image_name}"
                    }
                }
            }
        }

        stage('Update Artifact Repo') {
            when {
                expression {
                    env.MODE_EXECUTION == 'docker' &&
                    env.CHOIX_ACTION == 'build'
                }
            }

            steps {
                script {
                
                    def userInput = input(
                        id: 'artifact_env',
                        message: 'Entrer l’environnement',
                        parameters: [
                            choice(
                                name: 'ENV_NAME',
                                choices: ['prod', ' '],
                                description: 'Choisir environnement'
                            )
                        ]
                    )

                    // fichier cible selon environnement choisi
                    def FILE=""

                    if (userInput == "") {
                        env.image_name="${env.image_name}"
                        FILE="docker_compose/Myauxilium/docker-compose_checkback.yml"

                    } else if (userInput == "prod") {
                        env.image_name="${env.image_name}"
                        FILE="docker_compose/Myauxilium/docker-compose_checkback.yml"
                    } 
                    

                    sshagent(['github-ssh-key']) {
                    
                        sh """
                        set -e

                        mkdir -p ~/.ssh
                        ssh-keyscan -H github.com >> ~/.ssh/known_hosts 2>/dev/null
                        chmod 644 ~/.ssh/known_hosts

                        rm -rf deployment

                        git clone git@github.com:constegit/Docker_artifact.git deployment

                        cd deployment

                        git checkout master
                        git pull origin master

                        FILE="${FILE}"

                        echo "Target file: \$FILE"

                        old_image=\$(grep -m1 '^ *image:' \$FILE | awk '{print \$2}')

                        echo "Ancienne image: \$old_image"

                        # supprimer ancien commentaire OLD
                        sed -i -E 's/[[:space:]]+# OLD:.*//g' \$FILE

                        # mise à jour + commentaire historique
                        sed -i -E "s|^([[:space:]]*image:).*|\\1 ${dockerhub_username}/${env.image_name}:build_${BUILD_NUMBER} # OLD: \$old_image|g" \$FILE

                        echo "Nouvelle ligne :"

                        grep -m1 '^ *image:' \$FILE

                        git config user.email "jenkins@ci.com"
                        git config user.name "Jenkins"

                        git add \$FILE

                        if ! git diff --cached --quiet; then

                            git commit -m "deploy ${env.image_name}:build_${BUILD_NUMBER}"

                            TAG="deploy-${BUILD_NUMBER}"

                            if ! git rev-parse "\$TAG" >/dev/null 2>&1; then
                                git tag -a "\$TAG" -m "Deployment ${BUILD_NUMBER}"
                            fi

                            git push origin master
                            git push origin "\$TAG"

                        else
                            echo "Aucun changement détecté"
                        fi
                        """
                    }
                }
            }
        }

        stage('Cleaning Image') {
            when {
                expression { env.MODE_EXECUTION == 'docker' && env.CHOIX_ACTION == 'build' }
            }
            steps {
                sh "docker rmi -f ${dockerhub_username}/${env.image_name}:build_${BUILD_NUMBER} || true"
                sh "docker rmi -f ${dockerhub_username}/${env.image_name} || true"
            }
            post {
                success {
                    slackSend channel: "${slackSend_channel}", message: "(${JOB_NAME}) La suppression de l'image ${DOCKER_TAG_NAME} est rÃ©ussie", teamDomain: "${slack_domain}", tokenCredentialId: "${slack_tokens}", botUser: 'true', color: 'good', iconEmoji: ':thumbsup:'
                }
                failure {
                    slackSend channel: "${slackSend_channel}", message: "(${JOB_NAME}) La suppression de l'image ${DOCKER_TAG_NAME} a Ã©chouÃ© !", teamDomain: "${slack_domain}", tokenCredentialId: "${slack_tokens}", botUser: 'true', color: 'danger', iconEmoji: ':thumbsdown:'
                }
            }
        }

        stage('Demander le REMOTE_HOST') {
            when {
                expression { env.MODE_EXECUTION == 'docker' && env.CHOIX_ACTION == 'environment' }
            }
            steps {
                script {
                    env.REMOTE_HOST = input(
                        id: 'remote_host_input',
                        message: 'Entrez l\'adresse SSH du serveur distant (REMOTE_HOST)',
                        parameters: [
                            string(defaultValue: 'johfanang@IPs-twifone', description: 'Exemple : user@ip', name: 'REMOTE_HOST')
                        ]
                    )
                }
            }
        }

        stage('Choisir Environnement pour Vault') {
            when {
                expression { env.MODE_EXECUTION == 'docker' && env.CHOIX_ACTION == 'environment' }
            }
            steps {
                script {
                    env.USER_ENV_NAME = input(
                        id: 'UserEnvInput',
                        message: 'Entrer l\'environnement (ex: prod)',
                        parameters: [
                            string(defaultValue: '', description: 'Nom de l\'environnement', name: 'ENV_NAME')
                        ]
                    )

                    if (env.USER_ENV_NAME == "") {
                        env.vaultPath = "${env.projectName}/${env.sanitizedBranchName}"
                        env.dir = "${env.sanitizedBranchName}"
                    } else if (env.USER_ENV_NAME == "prod") {
                        env.vaultPath = "${env.projectName}/${env.sanitizedBranchName}"
                        env.dir = "${env.sanitizedBranchName}"
                    }else {
                        env.vaultPath = "${env.projectName}/${env.sanitizedBranchName}"
                        env.dir = "${env.sanitizedBranchName}"
                    }
                }
            }
        }

        stage('RÃ©cupÃ©rer secrets depuis Vault') {
            when {
                expression { env.MODE_EXECUTION == 'docker' && env.CHOIX_ACTION == 'environment' }
            }
            steps {
                withVault(
                    configuration: [vaultCredentialId: "${VAULT_CREDENTIALS}"],
                    vaultSecrets: [[
                        path: "${env.vaultPath}",
                        engineVersion: 2,
                        secretValues: [[envVar: 'ENV_BACK', vaultKey: 'ENV_BACK']]
                    ]]
                ) {
                    sh '''
                        set +x
                        echo "$(echo $ENV_BACK | base64 --decode)" > .env
                    '''
                }
            }
        }

        stage('TransfÃ©rer .env par SSH') {
            when {
                expression { env.MODE_EXECUTION == 'docker' && env.CHOIX_ACTION == 'environment' }
            }
            steps {
                sshagent(['ssh-remote-server-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${REMOTE_HOST} 'mkdir -p /home/johfanang/docker/environment/${projectName}/${sanitizedBranchName}/${dir}'
                        ssh -o StrictHostKeyChecking=no ${REMOTE_HOST} 'if [ -d /home/johfanang/docker/environment/${projectName}/${sanitizedBranchName}/${dir}/.env ]; then rm -rf /home/johfanang/docker/environment/${projectName}/${sanitizedBranchName}/${dir}/.env; fi'
                        scp -o StrictHostKeyChecking=no .env ${REMOTE_HOST}:/home/johfanang/docker/environment/${projectName}/${sanitizedBranchName}/${dir}/.env
                    """
                }
            }
        }
    }

    post {
        always {
            script {
                echo "Pipeline terminÃ© (${env.CHOIX_ACTION})"
                if (env.CHOIX_ACTION == 'build') {
                    sh 'docker logout'
                    sh "docker rmi -f ${dockerhub_username}/${env.image_name}:build_${BUILD_NUMBER} || true"
                    sh 'docker image prune -f'
                }

                slackSend channel: "${slackSend_channel}", message: "Pipeline terminÃ© pour ${projectName}", teamDomain: "${slack_domain}", tokenCredentialId: "${slack_tokens}", botUser: 'true', color: 'good'
            }
        }
    }
}